import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_BUCKET =
  import.meta.env.VITE_SUPABASE_BUCKET || 'agrostyle';

const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!configured) {
  console.warn(
    '[Supabase] Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Copia .env.example a .env.local y configura tus credenciales.'
  );
}

const missingConfigMessage =
  'Supabase no está configurado. Crea un archivo .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example).';

const notConfiguredProxy = new Proxy(
  {},
  {
    get() {
      throw new Error(missingConfigMessage);
    },
  }
);

export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : notConfiguredProxy;

export function isSupabaseConfigured() {
  return configured;
}

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase no está configurado. Crea un archivo .env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.'
    );
  }
  return supabase;
}
