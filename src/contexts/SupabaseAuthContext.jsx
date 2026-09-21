import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase, supabaseConfiguration } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

const AuthContext = createContext(undefined);

export const translateAuthError = (error) => {
  if (!error) return 'Ocorreu um erro desconhecido.';
  const code = error.code?.toLowerCase();
  const msg = error.message?.toLowerCase();

  if (code?.startsWith('supabase_config_')) {
    return error.message;
  }

  if (code === 'invalid_credentials' || msg?.includes('invalid login credentials')) {
    return 'Email ou senha incorretos.';
  }
  if (code === 'user_already_exists' || code === 'user_already_exists_wrong_password' || msg?.includes('already registered')) {
    return 'Este email já está cadastrado. Faça login ou verifique sua senha.';
  }
  if (code === 'invalid_email_format' || msg?.includes('invalid email')) {
    return 'Formato de email inválido.';
  }
  if (code === 'weak_password' || msg?.includes('password should be at least')) {
    return 'A senha é muito fraca. Use uma senha mais forte.';
  }
  if (code === 'user_not_found') {
    return 'Usuário não encontrado. Cadastre-se primeiro.';
  }
  if (code === 'network_error' || code === 'internal_error' || msg?.includes('fetch') || msg?.includes('network')) {
    return 'Não foi possível conectar ao Supabase. Verifique o Project URL, a chave pública e sua conexão com a internet.';
  }
  
  return 'Ocorreu um erro inesperado. Tente novamente mais tarde.';
};

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Logout state management to prevent race conditions
  const isLoggingOut = useRef(false);
  const logoutAttempts = useRef(0);

  const logInfo = (msg, data = {}) => {
    console.log(`[Auth - ${new Date().toISOString()}] ${msg}`, data);
  };

  const logError = (msg, err) => {
    console.error(`[Auth - ${new Date().toISOString()}] ERROR: ${msg}`, { 
      code: err?.code, 
      message: err?.message, 
      status: err?.status,
      name: err?.name
    });
  };

  const clearSession = useCallback(() => {
    setSession(null);
    setCurrentUser(null);
    setIsLoading(false);
    for (const key in localStorage) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.removeItem(key);
      }
    }
  }, []);

  const handleSession = useCallback((currentSession) => {
    if (currentSession?.user) {
      setSession(currentSession);
      setCurrentUser(currentSession.user);
    } else {
      clearSession();
    }
    setIsLoading(false);
  }, [clearSession]);

  const validateSession = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session) {
        clearSession();
        return false;
      }
      return true;
    } catch (err) {
      clearSession();
      return false;
    }
  }, [clearSession]);

  useEffect(() => {
    if (!supabaseConfiguration.isValid) {
      setError(supabaseConfiguration.error.message);
      setIsLoading(false);
      return undefined;
    }

    let mounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          if (mounted) {
            console.warn("Auth initialization warning:", sessionError.message);
            clearSession();
          }
        } else if (mounted) {
          handleSession(session);
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
        if (mounted) clearSession();
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!mounted) return;

        // Ignore auth state changes during logout to prevent race conditions
        if (isLoggingOut.current) {
          logInfo(`Auth state change ignored (logout in progress): ${event}`);
          return;
        }

        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          clearSession();
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          handleSession(currentSession);
        } else if (event === 'INITIAL_SESSION') {
          handleSession(currentSession);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [handleSession, clearSession]);

  const signup = useCallback(async (email, password, fullName) => {
    logInfo('Signup attempt started');
    setError(null);

    if (!supabaseConfiguration.isValid) {
      setError(supabaseConfiguration.error.message);
      return { data: null, error: supabaseConfiguration.error };
    }
    
    try {
      logInfo('Proceeding with signUp');
      const signUpRes = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: 'Cliente',
          }
        },
      });

      if (signUpRes.error) {
        logError(`Signup returned an error from Supabase`, signUpRes.error);
        const translatedErr = translateAuthError(signUpRes.error);
        setError(translatedErr);
        return { data: null, error: signUpRes.error };
      }

      logInfo('Signup successful');
      return { data: signUpRes.data, error: null };

    } catch (err) {
      logError(`Unexpected exception caught in signUp method`, err);
      const internalErr = 'Erro interno na requisição.';
      setError(internalErr);
      return { data: null, error: { code: 'internal_error', message: internalErr } };
    }
  }, []);

  const login = useCallback(async (email, password) => {
    logInfo('Signin attempt started');
    setError(null);

    if (!supabaseConfiguration.isValid) {
      setError(supabaseConfiguration.error.message);
      return { data: null, error: supabaseConfiguration.error };
    }

    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (err) {
        logError(`Signin failed`, err);
        const translatedErr = translateAuthError(err);
        setError(translatedErr);
        return { data: null, error: err };
      }

      logInfo('Signin successful');
      return { data, error: null };
    } catch (err) {
      logError(`Unexpected exception caught in login method`, err);
      const networkError = {
        code: 'network_error',
        message: err?.message || 'Falha de conexão com o Supabase.',
      };
      setError(translateAuthError(networkError));
      return { data: null, error: networkError };
    }
  }, []);

  const logout = useCallback(async () => {
    // Prevent concurrent logout attempts (mutex-like behavior)
    if (isLoggingOut.current) {
      logInfo('Logout already in progress, skipping duplicate attempt');
      return { success: true, alreadyInProgress: true };
    }
    
    // Set logout flag to prevent race conditions
    isLoggingOut.current = true;
    logoutAttempts.current += 1;
    
    const attemptNumber = logoutAttempts.current;
    logInfo(`========== Logout Attempt #${attemptNumber} Started ==========`);
    logInfo(`Timestamp: ${new Date().toISOString()}`);
    setError(null);
    
    try {
      // STEP 1: Clear local state FIRST (critical - ensures user is logged out locally)
      logInfo('[STEP 1/2] Clearing local session state and localStorage');
      
      // Log current state before clearing
      const hadSession = !!session;
      const hadUser = !!currentUser;
      logInfo(`Pre-clear state: Session=${hadSession}, User=${hadUser}`);
      
      // Clear all Supabase auth tokens from localStorage
      const clearedKeys = [];
      for (const key in localStorage) {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          localStorage.removeItem(key);
          clearedKeys.push(key);
        }
      }
      logInfo(`Cleared ${clearedKeys.length} localStorage keys:`, clearedKeys);
      
      // Clear React state immediately
      setSession(null);
      setCurrentUser(null);
      setIsLoading(false);
      
      logInfo('[STEP 1/2] ✓ Local state cleared successfully');
      
      // STEP 2: Attempt server-side logout (best-effort, non-blocking)
      logInfo('[STEP 2/2] Attempting server-side signOut');
      
      try {
        const { error: signOutError } = await supabase.auth.signOut();
        
        if (signOutError) {
          // Categorize errors as ignorable (expected) or unexpected
          const errorCode = signOutError.code;
          const errorStatus = signOutError.status;
          const errorMessage = signOutError.message || '';
          
          // Check if error is acceptable/ignorable
          const is403Forbidden = errorStatus === 403 || errorCode === 403;
          const isSessionNotFound = 
            errorMessage.includes('session_not_found') ||
            errorMessage.includes('Session from session_id claim in JWT does not exist');
          const isJWTInvalid = 
            errorMessage.includes('JWT') ||
            errorMessage.includes('Invalid Refresh Token') ||
            errorMessage.includes('Refresh Token Not Found') ||
            errorMessage.includes('expired') ||
            errorMessage.includes('malformed') ||
            errorMessage.includes('invalid');
          
          const isIgnorable = is403Forbidden || isSessionNotFound || isJWTInvalid;
          
          if (isIgnorable) {
            // These errors are acceptable - session was already invalid on server
            const errorCategory = is403Forbidden ? '403_FORBIDDEN' : 
                                 isSessionNotFound ? 'SESSION_NOT_FOUND' : 
                                 'JWT_INVALID';
            
            logInfo('[STEP 2/2] ⚠ Server signOut returned ignorable error (session already invalid on server)', {
              category: errorCategory,
              code: errorCode,
              status: errorStatus,
              message: errorMessage
            });
          } else {
            // Log unexpected errors for debugging, but don't fail logout
            logError('[STEP 2/2] Server signOut returned unexpected error (non-blocking)', {
              code: errorCode,
              status: errorStatus,
              message: errorMessage,
              fullError: signOutError
            });
          }
        } else {
          logInfo('[STEP 2/2] ✓ Server signOut completed successfully');
        }
      } catch (serverException) {
        // Network errors, timeouts, etc. during server signOut
        logError('[STEP 2/2] Exception during server signOut (non-blocking)', serverException);
      }
      
      logInfo(`========== Logout Attempt #${attemptNumber} Completed Successfully ==========`);
      
    } catch (unexpectedError) {
      // Catch any unexpected errors in the entire logout flow
      logError('Unexpected error in logout flow (logout still succeeded)', unexpectedError);
    } finally {
      // Always reset the logout flag
      isLoggingOut.current = false;
      logInfo('Logout flag reset, ready for next operation');
    }
    
    return { success: true };
  }, [session, currentUser]);

  const value = useMemo(() => ({
    currentUser,
    isLoading,
    error,
    login,
    signup,
    logout,
    validateSession,
    user: currentUser,
    loading: isLoading,
    signIn: login,
    signUp: signup,
    signOut: logout
  }), [currentUser, isLoading, error, login, signup, logout, validateSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
