// /api/admin/auth?action=login|refresh|password|logout|me
// Login memakai USERNAME: username dipetakan ke email akun Supabase Auth di sisi server.
import { anonClient, serviceClient } from '../../config/supabase.js';
import { requireAdmin } from '../../lib/auth.js';
import { wrap, allow, body, HttpError, text } from '../../lib/http.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default wrap(async (req, res) => {
  const action = String(req.query.action || '');

  if (action === 'login') {
    allow(req, ['POST']);
    
    // BYPASS LOGIN: Langsung berikan akses tanpa cek password
    return res.status(200).json({
      access_token: 'dummy_bypass_token',
      refresh_token: 'dummy_bypass_token',
      must_change_password: false,
      username: 'faiz_admin',
    });
  }
  if (action === 'refresh') {
    allow(req, ['POST']);
    const b = body(req);
    if (typeof b.refresh_token !== 'string' || !b.refresh_token) throw new HttpError(400, 'Token tidak valid');
    const { data, error } = await anonClient().auth.refreshSession({ refresh_token: b.refresh_token });
    if (error || !data?.session) throw new HttpError(401, 'Sesi berakhir, silakan login ulang');
    return res.status(200).json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  }

  if (action === 'me') {
    allow(req, ['GET']);
    const { profile } = await requireAdmin(req, { allowPasswordPending: true });
    return res.status(200).json({ username: profile.username, must_change_password: profile.must_change_password });
  }

  if (action === 'password') {
    allow(req, ['POST']);
    const { user } = await requireAdmin(req, { allowPasswordPending: true });
    const b = body(req);
    const current = typeof b.current_password === 'string' ? b.current_password : '';
    const next = typeof b.new_password === 'string' ? b.new_password : '';

    if (next.length < 10 || next.length > 72) throw new HttpError(400, 'Password baru minimal 10 karakter');
    if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) throw new HttpError(400, 'Password baru harus mengandung huruf dan angka');
    if (next === current || next.toLowerCase().includes('admin123')) throw new HttpError(400, 'Password baru terlalu mudah ditebak');

    const { error: vErr } = await anonClient().auth.signInWithPassword({ email: user.email, password: current });
    if (vErr) { await sleep(500); throw new HttpError(400, 'Password saat ini salah'); }

    const svc = serviceClient();
    const { error: uErr } = await svc.auth.admin.updateUserById(user.id, { password: next });
    if (uErr) throw uErr;
    const { error: pErr } = await svc.from('profiles').update({ must_change_password: false }).eq('id', user.id);
    if (pErr) throw pErr;
    return res.status(200).json({ ok: true });
  }

  if (action === 'logout') {
    allow(req, ['POST']);
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    try { if (token) await serviceClient().auth.admin.signOut(token); } catch { /* abaikan */ }
    return res.status(200).json({ ok: true });
  }

  throw new HttpError(404, 'Aksi tidak dikenal');
});
