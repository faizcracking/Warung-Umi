// /api/admin/orders  GET (?status=) | PATCH ?id= {status?, is_paid?}
import { requireAdmin } from '../../lib/auth.js';
import { wrap, allow, body, HttpError, isUuid } from '../../lib/http.js';

const STATUSES = ['Menunggu konfirmasi', 'Diproses', 'Selesai', 'Dibatalkan'];

export default wrap(async (req, res) => {
  allow(req, ['GET', 'PATCH']);
  const { db } = await requireAdmin(req);

  if (req.method === 'GET') {
    let q = db.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).limit(200);
    if (req.query.status && STATUSES.includes(req.query.status)) q = q.eq('status', req.query.status);
    const { data, error } = await q;
    if (error) throw error;
    return res.status(200).json({ orders: data });
  }

  const id = String(req.query.id || '');
  if (!isUuid(id)) throw new HttpError(400, 'ID pesanan tidak valid');
  const b = body(req);
  const patch = {};
  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) throw new HttpError(400, 'Status tidak valid');
    patch.status = b.status;
  }
  if (b.is_paid !== undefined) patch.is_paid = !!b.is_paid;
  if (!Object.keys(patch).length) throw new HttpError(400, 'Tidak ada perubahan');

  const { data, error } = await db.from('orders').update(patch).eq('id', id).select('*, order_items(*)').single();
  if (error) throw error;
  res.status(200).json({ order: data });
});
