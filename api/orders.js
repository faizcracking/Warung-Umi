// POST /api/orders - membuat pesanan. Harga TIDAK dipercaya dari browser:
// server hanya menerima id produk + jumlah, lalu menghitung ulang harga (termasuk promo yang masih berlaku).
import { randomInt } from 'node:crypto';
import { serviceClient } from '../config/supabase.js';
import { wrap, allow, body, HttpError, isUuid, text, int, normalizePhone } from '../lib/http.js';
import { withPricing } from '../lib/pricing.js';
import { buildOrderMessage, waLink } from '../lib/whatsapp.js';

function newCode() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 4; i++) r += chars[randomInt(chars.length)];
  return `WU-${ymd}-${r}`;
}

export default wrap(async (req, res) => {
  allow(req, ['POST']);
  const b = body(req);
  if (b.website) throw new HttpError(400, 'Permintaan ditolak'); // honeypot anti-bot

  const name = text(b.name, 80);
  if (name.length < 2) throw new HttpError(400, 'Nama pelanggan wajib diisi (minimal 2 huruf)');
  const phone = normalizePhone(b.phone);
  if (!/^628\d{7,12}$/.test(phone)) throw new HttpError(400, 'Nomor HP tidak valid. Contoh: 08123456789');
  const delivery = b.delivery === 'diantar' || b.delivery === 'ambil_sendiri' ? b.delivery : null;
  if (!delivery) throw new HttpError(400, 'Pilih metode pengiriman');
  const address = text(b.address, 300, { multiline: true });
  if (delivery === 'diantar' && address.length < 10) throw new HttpError(400, 'Alamat lengkap wajib diisi untuk pesanan diantar');
  const notes = text(b.notes, 300, { multiline: true });

  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 50) throw new HttpError(400, 'Keranjang kosong atau tidak valid');
  const qtyById = new Map();
  for (const it of b.items) {
    if (!isUuid(it?.id)) throw new HttpError(400, 'Produk tidak valid');
    const qty = int(it.qty, 1, 99, 'Jumlah');
    qtyById.set(it.id, Math.min((qtyById.get(it.id) || 0) + qty, 99));
  }

  const db = serviceClient();
  const { data: products, error } = await db.from('products').select('*').in('id', [...qtyById.keys()]).eq('is_active', true);
  if (error) throw error;

  const now = new Date();
  const lines = [];
  const problems = [];
  for (const [id, qty] of qtyById) {
    const p = products.find((x) => x.id === id);
    if (!p) { problems.push('Ada produk yang sudah tidak tersedia'); continue; }
    if (p.stock < qty) { problems.push(`Stok ${p.name} tidak mencukupi (sisa ${p.stock})`); continue; }
    const pr = withPricing(p, now);
    lines.push({ id, name: p.name, qty, normal: p.price, pct: pr.discount_applied, price: pr.final_price, line: pr.final_price * qty, promo: pr.promo_active });
  }
  if (problems.length) throw new HttpError(409, problems.join('; ') + '. Perbarui keranjang Anda.');

  const total = lines.reduce((s, l) => s + l.line, 0);
  const subtotalNormal = lines.reduce((s, l) => s + l.normal * l.qty, 0);

  let order = null;
  for (let i = 0; i < 3 && !order; i++) {
    const { data, error: e } = await db
      .from('orders')
      .insert({ order_code: newCode(), customer_name: name, customer_phone: phone, customer_address: delivery === 'diantar' ? address : '', notes, delivery_method: delivery, subtotal_normal: subtotalNormal, total })
      .select()
      .single();
    if (!e) order = data;
    else if (e.code !== '23505') throw e; // 23505 = kode bentrok, coba lagi
  }
  if (!order) throw new HttpError(500, 'Gagal membuat kode pesanan, coba lagi');

  const { error: itemErr } = await db.from('order_items').insert(
    lines.map((l) => ({ order_id: order.id, product_id: l.id, product_name: l.name, unit_price_normal: l.normal, discount_percentage: l.pct, unit_price_final: l.price, quantity: l.qty, line_total: l.line }))
  );
  if (itemErr) {
    await db.from('orders').delete().eq('id', order.id);
    throw itemErr;
  }

  const { data: st } = await db.from('store_settings').select('store_name, whatsapp_number').eq('id', 1).maybeSingle();
  const storeName = st?.store_name || 'Warung Umi';
  const message = buildOrderMessage({
    storeName, code: order.order_code, items: lines, total, saving: subtotalNormal - total,
    customer: { name, phone: b.phone ? text(b.phone, 20) : phone, address }, delivery, notes,
  });

  res.status(201).json({
    order: { code: order.order_code, total, saving: subtotalNormal - total },
    items: lines,
    message,
    whatsapp_url: waLink(st?.whatsapp_number || '6285213205216', message),
  });
});
