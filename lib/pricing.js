// Perhitungan harga & promo. Dipakai backend; rumus yang sama ada di public/js/shop.js.
// Harga Promo = Harga Normal - (Harga Normal x Persentase Diskon / 100)

export function isPromoActive(p, now = new Date()) {
  const pct = Number(p.discount_percentage) || 0;
  if (!p.is_discount_active || pct <= 0) return false;
  if (p.discount_start && new Date(p.discount_start) > now) return false; // belum mulai
  if (p.discount_end && new Date(p.discount_end) < now) return false; // sudah berakhir
  return true;
}

export const calcPromoPrice = (normal, pct) => Math.round(normal - (normal * pct) / 100);

// Menambahkan field harga final ke data produk. Harga normal (price) TIDAK diubah.
export function withPricing(p, now = new Date()) {
  const active = isPromoActive(p, now);
  const pct = active ? Number(p.discount_percentage) : 0;
  const final_price = active ? calcPromoPrice(p.price, pct) : p.price;
  return { ...p, promo_active: active, discount_applied: pct, final_price, saving: p.price - final_price };
}

export const rupiah = (n) => 'Rp' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
