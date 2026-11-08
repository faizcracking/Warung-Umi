// /api/admin/products  GET (semua) | POST (tambah) | PUT ?id= (ubah) | DELETE ?id=
import { requireAdmin } from '../../lib/auth.js';
import { wrap, allow, body, HttpError, isUuid, text, int, dateOrNull } from '../../lib/http.js';
import { withPricing } from '../../lib/pricing.js';

function validate(b) {
  const name = text(b.name, 120);
  if (!name) throw new HttpError(400, 'Nama produk wajib diisi');
  if (b.category_id && !isUuid(b.category_id)) throw new HttpError(400, 'Kategori tidak valid');
  const image_url = b.image_url ? text(b.image_url, 500) : null;
  if (image_url && !/^https:\/\//i.test(image_url)) throw new HttpError(400, 'URL foto tidak valid');

  const row = {
    name,
    description: text(b.description, 1000, { multiline: true }),
    category_id: b.category_id || null,
    price: int(b.price, 0, 100000000, 'Harga normal'),
    stock: int(b.stock, 0, 1000000, 'Stok'),
    image_url,
    is_active: !!b.is_active,
    is_featured: !!b.is_featured,
    is_discount_active: !!b.is_discount_active,
    discount_percentage: int(b.discount_percentage ?? 0, 0, 90, 'Persentase diskon'),
    discount_start: dateOrNull(b.discount_start, 'Tanggal mulai promo'),
    discount_end: dateOrNull(b.discount_end, 'Tanggal berakhir promo'),
  };
  if (row.is_discount_active) {
    if (row.discount_percentage < 1) throw new HttpError(400, 'Isi persentase diskon (1-90) untuk mengaktifkan promo');
    if (row.discount_start && row.discount_end && new Date(row.discount_end) <= new Date(row.discount_start))
      throw new HttpError(400, 'Tanggal berakhir promo harus setelah tanggal mulai');
  }
  return row;
}

export default wrap(async (req, res) => {
  allow(req, ['GET', 'POST', 'PUT', 'DELETE']);
  const { db } = await requireAdmin(req);
  const SEL = '*, categories(name, slug)';

  if (req.method === 'GET') {
    const { data, error } = await db.from('products').select(SEL).order('created_at', { ascending: false });
    if (error) throw error;
    return res.status(200).json({ products: data.map((p) => withPricing(p)) });
  }

  if (req.method === 'POST') {
    const { data, error } = await db.from('products').insert(validate(body(req))).select(SEL).single();
    if (error) throw error;
    return res.status(201).json({ product: withPricing(data) });
  }

  const id = String(req.query.id || '');
  if (!isUuid(id)) throw new HttpError(400, 'ID produk tidak valid');

  if (req.method === 'PUT') {
    const { data, error } = await db.from('products').update(validate(body(req))).eq('id', id).select(SEL).single();
    if (error) throw error;
    return res.status(200).json({ product: withPricing(data) });
  }

  const { error } = await db.from('products').delete().eq('id', id);
  if (error) throw error;
  res.status(200).json({ ok: true });
});
