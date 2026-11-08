// Pembuat pesan & link WhatsApp. Pesan dibuat di server dari harga yang sudah divalidasi.
import { rupiah } from './pricing.js';
import { normalizePhone } from './http.js';

export const waNumber = (n) => normalizePhone(n);

export function buildOrderMessage({ storeName, code, items, total, saving, customer, delivery, notes }) {
  const L = [`Assalamu'alaikum ${storeName}.`, '', 'Saya ingin memesan:', ''];
  items.forEach((it, i) => {
    if (it.promo) {
      L.push(
        `${i + 1}. ${it.name} x ${it.qty}`,
        `   Harga normal: ${rupiah(it.normal)}`,
        `   Diskon: ${it.pct}%`,
        `   Harga promo: ${rupiah(it.price)}`,
        `   Subtotal: ${rupiah(it.line)}`
      );
    } else {
      L.push(`${i + 1}. ${it.name} x ${it.qty} = ${rupiah(it.line)}`);
    }
  });
  L.push('');
  if (saving > 0) L.push(`Total hemat promo: ${rupiah(saving)}`);
  L.push(`Total Pembayaran: ${rupiah(total)}`, '');
  L.push(`Kode Pesanan: ${code}`);
  L.push(`Nama: ${customer.name}`);
  L.push(`Nomor HP: ${customer.phone}`);
  L.push(`Pengiriman: ${delivery === 'diantar' ? 'Diantar' : 'Ambil sendiri di toko'}`);
  if (delivery === 'diantar') L.push(`Alamat: ${customer.address}`);
  if (notes) L.push(`Catatan: ${notes}`);
  L.push('', 'Mohon konfirmasi pesanan saya. Terima kasih.');
  return L.join('\n');
}

export const waLink = (number, message) => `https://wa.me/${waNumber(number)}?text=${encodeURIComponent(message)}`;
