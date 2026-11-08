import test from 'node:test';
import assert from 'node:assert/strict';
import { calcPromoPrice, isPromoActive, withPricing, rupiah } from '../lib/pricing.js';
import { buildOrderMessage, waLink } from '../lib/whatsapp.js';
import { normalizePhone } from '../lib/http.js';

test('rumus harga promo', () => {
  assert.equal(calcPromoPrice(25000, 20), 20000);
  assert.equal(calcPromoPrice(80000, 10), 72000);
  assert.equal(calcPromoPrice(15500, 15), 13175);
});

test('promo hanya aktif dalam rentang tanggal', () => {
  const base = { price: 25000, discount_percentage: 20, is_discount_active: true };
  const now = new Date('2026-11-08T10:00:00Z');
  assert.equal(isPromoActive(base, now), true);
  assert.equal(isPromoActive({ ...base, is_discount_active: false }, now), false);
  assert.equal(isPromoActive({ ...base, discount_start: '2026-11-09T00:00:00Z' }, now), false);
  assert.equal(isPromoActive({ ...base, discount_end: '2026-11-07T00:00:00Z' }, now), false);
  assert.equal(isPromoActive({ ...base, discount_start: '2026-11-01T00:00:00Z', discount_end: '2026-11-30T00:00:00Z' }, now), true);
});

test('promo berakhir -> harga kembali normal, harga normal tidak berubah', () => {
  const p = { price: 25000, discount_percentage: 20, is_discount_active: true, discount_end: '2026-01-01T00:00:00Z' };
  const r = withPricing(p, new Date('2026-11-08T00:00:00Z'));
  assert.equal(r.final_price, 25000);
  assert.equal(r.price, 25000);
  assert.equal(r.promo_active, false);
});

test('format rupiah & nomor HP', () => {
  assert.equal(rupiah(111000), 'Rp111.000');
  assert.equal(normalizePhone('0852-1320-5216'), '6285213205216');
  assert.equal(normalizePhone('+62 852 1320 5216'), '6285213205216');
});

test('pesan WhatsApp di-encode dengan benar', () => {
  const msg = buildOrderMessage({
    storeName: 'Warung Umi', code: 'WU-TEST', total: 111000, saving: 0,
    items: [
      { name: 'Beras Lahap 5 kg', qty: 1, normal: 75000, pct: 0, price: 75000, line: 75000, promo: false },
      { name: 'Gula GMP 1 kg', qty: 2, normal: 18000, pct: 0, price: 18000, line: 36000, promo: false },
    ],
    customer: { name: 'Ahmad', phone: '08123456789', address: 'Jaten, Karanganyar' },
    delivery: 'diantar', notes: 'Mohon diantar & cepat',
  });
  assert.match(msg, /Total Pembayaran: Rp111\.000/);
  const url = waLink('085213205216', msg);
  assert.ok(url.startsWith('https://wa.me/6285213205216?text='));
  assert.equal(decodeURIComponent(url.split('text=')[1]), msg);
});
