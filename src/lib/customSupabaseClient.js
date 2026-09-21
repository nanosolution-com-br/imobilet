import { createClient } from '@supabase/supabase-js';
import { inspectSupabaseConfiguration } from '@/lib/supabaseConfiguration';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabaseLegacyAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfiguration = inspectSupabaseConfiguration({
  url: supabaseUrl,
  publishableKey: supabasePublishableKey,
  legacyAnonKey: supabaseLegacyAnonKey,
});

// Keep the interface renderable when local configuration is incomplete.
// Auth operations are blocked by AuthProvider until valid values are supplied.
const customSupabaseClient = createClient(
  supabaseConfiguration.isValid ? supabaseConfiguration.url : 'https://configuration.invalid',
  supabaseConfiguration.isValid ? supabaseConfiguration.publicKey : 'sb_publishable_configuration_invalid',
);

export default customSupabaseClient;

export {
  customSupabaseClient,
  customSupabaseClient as supabase,
};
