// GET /api/products  - daftar produk AKTIF untuk customer (harga promo dihitung di server).
// Query: view=promo|promo-new|saving|popular|recommended|newest, category=<slug>, q=<cari>,
//        sort=newest|price_asc|price_desc|discount, ids=<id,id,...>, limit=<n>
import { anonClient } from '../config/supabase.js';
import { wrap, allow, HttpError, isUuid } from '../lib/http.js';
import { withPricing } from '../lib/pricing.js';

const ts = (d) => (d ? new Date(d).getTime() : 0);

export default wrap(async (req, res) => {
  allow(req, ['GET']);
  const { view = '', category = '', q = '', sort = 'newest', ids = '' } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 200);

  let select = category ? '*, categories!inner(name, slug)' : '*, categories(name, slug)';
  let query = anonClient().from('products').select(select).eq('is_active', true).limit(300);

  if (ids) {
    const list = String(ids).split(',').filter(Boolean);
    if (list.length > 50 || !list.every(isUuid)) throw new HttpError(400, 'Parameter ids tidak valid');
    query = query.in('id', list);
  }
  if (category) query = query.eq('categories.slug', String(category).slice(0, 80));
  const term = String(q).replace(/[%,()*\\]/g, ' ').trim().slice(0, 60);
  if (term) query = query.ilike('name', `%${term}%`);

  const { data, error } = await query;
  if (error) throw error;

  const now = new Date();
  let list = data.map((p) => withPricing(p, now));

  switch (view) {
    case 'promo':
      list = list.filter((p) => p.promo_active);
      break;
    case 'promo-new': // promo terbaru: yang paling baru dimulai/diubah
      list = list.filter((p) => p.promo_active).sort((a, b) => ts(b.discount_start || b.updated_at) - ts(a.discount_start || a.updated_at));
      break;
    case 'saving': // paling hemat: diskon terbesar, lalu penghematan Rupiah terbesar
      list = list.filter((p) => p.promo_active).sort((a, b) => b.discount_applied - a.discount_applied || b.saving - a.saving);
      break;
    case 'popular':
      list = list.filter((p) => p.is_featured).sort((a, b) => ts(b.updated_at) - ts(a.updated_at));
      break;
    case 'recommended': // stok ada, promo lebih dulu
      list = list.filter((p) => p.stock > 0).sort((a, b) => Number(b.promo_active) - Number(a.promo_active) || ts(b.updated_at) - ts(a.updated_at));
      break;
    default: {
      const sorters = {
        price_asc: (a, b) => a.final_price - b.final_price,
        price_desc: (a, b) => b.final_price - a.final_price,
        discount: (a, b) => b.discount_applied - a.discount_applied,
        newest: (a, b) => ts(b.created_at) - ts(a.created_at),
      };
      list.sort(sorters[sort] || sorters.newest);
    }
  }
  res.status(200).json({ products: list.slice(0, limit) });
});
