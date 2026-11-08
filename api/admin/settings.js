// /api/admin/settings  GET | PUT  (pengaturan toko)
import { requireAdmin } from '../../lib/auth.js';
import { wrap, allow, body, HttpError, text, normalizePhone } from '../../lib/http.js';

export default wrap(async (req, res) => {
  allow(req, ['GET', 'PUT']);
  const { db } = await requireAdmin(req);

  if (req.method === 'GET') {
    const { data, error } = await db.from('store_settings').select('*').eq('id', 1).maybeSingle();
    if (error) throw error;
    return res.status(200).json({ settings: data });
  }

  const b = body(req);
  const store_name = text(b.store_name, 80);
  if (!store_name) throw new HttpError(400, 'Nama toko wajib diisi');
  const whatsapp_number = normalizePhone(b.whatsapp_number);
  if (!/^62\d{8,13}$/.test(whatsapp_number)) throw new HttpError(400, 'Nomor WhatsApp tidak valid. Contoh: 085213205216');
  const banner_url = b.banner_url ? text(b.banner_url, 500) : null;
  if (banner_url && !/^https:\/\//i.test(banner_url)) throw new HttpError(400, 'URL banner tidak valid');

  const row = {
    id: 1, store_name, whatsapp_number, banner_url,
    address: text(b.address, 300, { multiline: true }),
    description: text(b.description, 500, { multiline: true }),
    banner_title: text(b.banner_title, 80),
    banner_text: text(b.banner_text, 200),
  };
  const { data, error } = await db.from('store_settings').upsert(row).select().single();
  if (error) throw error;
  res.status(200).json({ settings: data });
});
