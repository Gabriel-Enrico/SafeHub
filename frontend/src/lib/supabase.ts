import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase =
  supabaseUrl && publishableKey
    ? createClient(supabaseUrl, publishableKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export const apiBaseUrl =
  import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function getCurrentAccessToken(): Promise<string> {
  if (!supabase) throw new Error('A autenticação do Supabase não está configurada.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error('Sua sessão expirou. Entre novamente.');
  return data.session.access_token;
}
