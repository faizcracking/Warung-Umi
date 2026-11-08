// POST /api/admin/upload {data: base64, content_type, folder: 'products'|'banners'}
// Diunggah atas nama admin yang login, sehingga kebijakan Storage (hanya admin) ikut berlaku.
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '../../lib/auth.js';
import { STORAGE_BUCKET } from '../../config/supabase.js';
import { wrap, allow, body, HttpError } from '../../lib/http.js';

const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.slice(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export default wrap(async (req, res) => {
  allow(req, ['POST']);
  const { db } = await requireAdmin(req);
  const b = body(req);
  const folder = b.folder === 'banners' ? 'banners' : 'products';
  if (typeof b.data !== 'string' || !TYPES[b.content_type]) throw new HttpError(400, 'File harus berupa gambar JPG, PNG, atau WEBP');

  const buf = Buffer.from(b.data, 'base64');
  if (!buf.length || buf.length > 3 * 1024 * 1024) throw new HttpError(400, 'Ukuran gambar maksimal 3 MB');
  const real = sniff(buf);
  if (!real || real !== b.content_type) throw new HttpError(400, 'Isi file bukan gambar yang valid');

  const path = `${folder}/${randomUUID()}.${TYPES[real]}`;
  const { error } = await db.storage.from(STORAGE_BUCKET).upload(path, buf, { contentType: real, upsert: false });
  if (error) throw new HttpError(500, 'Gagal mengunggah gambar: ' + error.message);

  const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  res.status(201).json({ url: data.publicUrl });
});
