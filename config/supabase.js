// Pembuat koneksi Supabase (hanya dipakai di server / folder api/).
import { createClient } from '@supabase/supabase-js';

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Environment variable ${name} belum diatur`);
  return v;
}

// Client "anon": tunduk pada Row Level Security (untuk data publik).
export const anonClient = () => createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), opts);

// Client atas nama pengguna yang login: RLS memakai identitas pengguna tsb.
export const userClient = (token) =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    ...opts,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

// Client "service role": melewati RLS. Pakai seminimal mungkin (login username & pembuatan pesanan).
export const serviceClient = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), opts);

export const STORAGE_BUCKET = 'store-assets';
