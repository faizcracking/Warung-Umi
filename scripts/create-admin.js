// Membuat akun admin pertama. Jalankan SEKALI dari komputer lokal:  npm run create-admin
// Membaca ADMIN_USERNAME, ADMIN_EMAIL (opsional), ADMIN_INITIAL_PASSWORD dari file .env
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_INITIAL_PASSWORD } = process.env;
const username = (process.env.ADMIN_USERNAME || 'admin123').trim().toLowerCase();
const email = (process.env.ADMIN_EMAIL || `${username}@warungumi.site`).trim().toLowerCase();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_INITIAL_PASSWORD) {
  console.error('Isi SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, dan ADMIN_INITIAL_PASSWORD di file .env terlebih dahulu.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password: ADMIN_INITIAL_PASSWORD,
  email_confirm: true,
});
if (error) {
  console.error('Gagal membuat user:', error.message);
  process.exit(1);
}

// Password disimpan ter-hash oleh Supabase Auth. Tabel profiles hanya menyimpan username -> akun.
const { error: pErr } = await supabase.from('profiles').upsert({
  id: data.user.id,
  username,
  email,
  role: 'admin',
  must_change_password: true,
});
if (pErr) {
  console.error('User dibuat, tetapi gagal membuat profil admin:', pErr.message, '\nPastikan database/schema.sql sudah dijalankan.');
  process.exit(1);
}

console.log(`Admin "${username}" berhasil dibuat. Login di /admin/login, lalu WAJIB ganti password.`);
console.log('Setelah itu, hapus ADMIN_INITIAL_PASSWORD dari file .env.');
