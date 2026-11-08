// GET /api/admin/dashboard - statistik ringkasan untuk admin.
import { requireAdmin } from '../../lib/auth.js';
import { wrap, allow } from '../../lib/http.js';
import { isPromoActive } from '../../lib/pricing.js';

export default wrap(async (req, res) => {
  allow(req, ['GET']);
  const { db } = await requireAdmin(req);

  const [prods, cats, ords, recentOrders, recentProducts] = await Promise.all([
    db.from('products').select('is_active, stock, is_discount_active, discount_percentage, discount_start, discount_end'),
    db.from('categories').select('id', { count: 'exact', head: true }),
    db.from('orders').select('status'),
    db.from('orders').select('order_code, customer_name, total, status, created_at').order('created_at', { ascending: false }).limit(5),
    db.from('products').select('name, updated_at').order('updated_at', { ascending: false }).limit(5),
  ]);
  for (const r of [prods, cats, ords, recentOrders, recentProducts]) if (r.error) throw r.error;

  const now = new Date();
  const products = prods.data;
  const byStatus = {};
  ords.data.forEach((o) => (byStatus[o.status] = (byStatus[o.status] || 0) + 1));

  const activity = [
    ...recentOrders.data.map((o) => ({ type: 'order', text: `Pesanan ${o.order_code} dari ${o.customer_name} (${o.status})`, at: o.created_at })),
    ...recentProducts.data.map((p) => ({ type: 'product', text: `Produk "${p.name}" diperbarui`, at: p.updated_at })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);

  res.status(200).json({
    total_products: products.length,
    available_products: products.filter((p) => p.is_active && p.stock > 0).length,
    out_of_stock: products.filter((p) => p.stock <= 0).length,
    active_promos: products.filter((p) => isPromoActive(p, now)).length,
    categories: cats.count || 0,
    total_orders: ords.data.length,
    orders_by_status: byStatus,
    activity,
  });
});
