const PLACEHOLDER_MARKERS = [
  'seu-projeto',
  'sua-chave',
  'substitute',
  'your-project',
  'your-key',
];

const containsPlaceholder = (value) => {
  const normalizedValue = value?.trim().toLowerCase() || '';
  return PLACEHOLDER_MARKERS.some(marker => normalizedValue.includes(marker));
};

const isValidProjectUrl = (value) => {
  try {
    const parsedUrl = new URL(value);
    const isLocal = ['localhost', '127.0.0.1'].includes(parsedUrl.hostname);
    const isHostedSupabaseUrl = parsedUrl.hostname.endsWith('.supabase.co');
    const projectReference = parsedUrl.hostname.replace(/\.supabase\.co$/, '');
    const hasValidHostedReference = !isHostedSupabaseUrl || /^[a-z0-9]{20}$/.test(projectReference);

    return (parsedUrl.protocol === 'https:' || (isLocal && parsedUrl.protocol === 'http:'))
      && !containsPlaceholder(value)
      && hasValidHostedReference;
  } catch {
    return false;
  }
};

const getLegacyJwtRole = (key) => {
  try {
    const encodedPayload = key.split('.')[1];
    const normalizedPayload = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=');
    return JSON.parse(atob(paddedPayload)).role;
  } catch {
    return null;
  }
};

const isValidPublicKey = (value) => {
  const key = value?.trim() || '';
  const isPublishableKey = key.startsWith('sb_publishable_') && key.length > 24;
  const jwtParts = key.split('.');
  const isLegacyAnonKey = jwtParts.length === 3
    && key.length > 100
    && getLegacyJwtRole(key) === 'anon';

  return !containsPlaceholder(key) && (isPublishableKey || isLegacyAnonKey);
};

export const inspectSupabaseConfiguration = ({
  url,
  publishableKey,
  legacyAnonKey,
}) => {
  const normalizedUrl = url?.trim() || '';
  const publicKey = publishableKey?.trim() || legacyAnonKey?.trim() || '';

  if (!normalizedUrl || !publicKey) {
    return {
      isValid: false,
      url: normalizedUrl,
      publicKey,
      error: {
        code: 'supabase_config_missing',
        message: 'A conexão com o Supabase ainda não foi configurada neste computador. Revise o arquivo .env.local e reinicie o servidor local.',
      },
    };
  }

  if (!isValidProjectUrl(normalizedUrl)) {
    return {
      isValid: false,
      url: normalizedUrl,
      publicKey,
      error: {
        code: 'supabase_config_invalid_url',
        message: 'O endereço do projeto Supabase no arquivo .env.local não é válido. Copie o Project URL exibido no painel do Supabase e reinicie o servidor local.',
      },
    };
  }

  if (!isValidPublicKey(publicKey)) {
    return {
      isValid: false,
      url: normalizedUrl,
      publicKey,
      error: {
        code: 'supabase_config_invalid_key',
        message: 'A chave pública do Supabase no arquivo .env.local não é válida. Use a Publishable key ou a chave anon, nunca a chave secret/service_role.',
      },
    };
  }

  return {
    isValid: true,
    url: normalizedUrl,
    publicKey,
    error: null,
  };
};
