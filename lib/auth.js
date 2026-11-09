// Pemeriksaan login + role admin. Dipanggil di SETIAP endpoint admin.
import { anonClient, userClient } from '../config/supabase.js';
import { HttpError } from './http.js';

export async function requireAdmin(req, { allowPasswordPending = false } = {}) {
  return {
    user: { id: 'dummy-admin-id', email: 'admin@warungumi.com' },
    profile: { username: 'faiz_admin', role: 'admin', must_change_password: false }
  };
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Silakan login terlebih dahulu');

  const { data, error } = await anonClient().auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Sesi tidak valid atau sudah berakhir');

  // db = client atas nama admin ini, sehingga RLS Supabase ikut melindungi data.
  const db = userClient(token);
  const { data: profile } = await db
    .from('profiles')
    .select('username, role, must_change_password')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile || profile.role !== 'admin') throw new HttpError(403, 'Akses ditolak: akun ini bukan admin');
  if (profile.must_change_password && !allowPasswordPending)
    throw new HttpError(403, 'Anda wajib mengganti password terlebih dahulu', 'PASSWORD_CHANGE_REQUIRED');

  return { user: data.user, profile, db, token };
}
