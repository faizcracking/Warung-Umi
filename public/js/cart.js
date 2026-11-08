/* WARUNG UMI - cart.js: keranjang (localStorage) + halaman keranjang.
   Yang disimpan di browser HANYA id produk & jumlah. Harga selalu diambil ulang dari server. */
(function () {
  'use strict';
  const WU = window.WU;
  const KEY = 'wu_cart';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = WU.esc, rupiah = WU.rupiah;

  const read = () => {
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(a) ? a.filter((i) => i && typeof i.id === 'string' && Number.isInteger(i.qty) && i.qty > 0) : [];
    } catch { return []; }
  };
  const write = (items) => {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* penyimpanan penuh/diblokir */ }
    updateBadge();
  };
  function updateBadge() {
    const el = $('#cart-count');
    if (!el) return;
    const n = read().reduce((s, i) => s + i.qty, 0);
    el.textContent = n > 99 ? '99+' : n;
    el.hidden = n === 0;
  }

  WU.cart = {
    read, write,
    clear() { write([]); },
    add(id, qty = 1, stock = Infinity) {
      if (stock <= 0) return WU.toast('Maaf, stok habis');
      const items = read();
      const cur = items.find((i) => i.id === id);
      const max = Math.min(stock, 99);
      const next = (cur ? cur.qty : 0) + qty;
      if (next > max) { WU.toast(`Stok tersedia hanya ${max}`); if (cur) cur.qty = max; else items.push({ id, qty: max }); }
      else { if (cur) cur.qty = next; else items.push({ id, qty: next }); WU.toast('Ditambahkan ke keranjang'); }
      write(items);
    },
    setQty(id, qty) { write(read().map((i) => (i.id === id ? { ...i, qty } : i)).filter((i) => i.qty > 0)); },
    remove(id) { write(read().filter((i) => i.id !== id)); },
    // Mengambil data terbaru dari server (harga promo yang masih berlaku, stok) untuk isi keranjang.
    async load() {
      const items = read();
      if (!items.length) return { lines: [], notes: [], total: 0, normalTotal: 0 };
      const { products } = await WU.api('/api/products?ids=' + items.map((i) => i.id).join(','));
      const map = new Map(products.map((p) => [p.id, p]));
      const lines = [], notes = [], fixed = [];
      for (const it of items) {
        const p = map.get(it.id);
        if (!p) { notes.push('Satu produk sudah tidak tersedia dan dihapus dari keranjang.'); continue; }
        let qty = it.qty;
        if (p.stock > 0 && qty > p.stock) { qty = p.stock; notes.push(`Jumlah "${p.name}" disesuaikan dengan stok (${p.stock}).`); }
        if (p.stock <= 0) notes.push(`"${p.name}" stok habis. Hapus dari keranjang untuk melanjutkan.`);
        fixed.push({ id: it.id, qty });
        lines.push({ p, qty, soldOut: p.stock <= 0, subtotal: p.final_price * qty });
      }
      write(fixed);
      const ok = lines.filter((l) => !l.soldOut);
      return { lines, notes, total: ok.reduce((s, l) => s + l.subtotal, 0), normalTotal: ok.reduce((s, l) => s + l.p.price * l.qty, 0) };
    },
  };

  WU.lineHtml = (l, editable) => `
    <div class="line" data-id="${esc(l.p.id)}">
      <div class="thumb">${l.p.image_url ? `<img src="${esc(l.p.image_url)}" alt="" loading="lazy">` : '🛒'}</div>
      <div>
        <div class="name">${esc(l.p.name)} ${l.p.promo_active ? `<span class="badge-promo" style="position:static">-${l.p.discount_applied}%</span>` : ''}</div>
        <div class="price"><span class="now ${l.p.promo_active ? 'promo' : ''}">${rupiah(l.p.final_price)}</span>${l.p.promo_active ? `<s>${rupiah(l.p.price)}</s>` : ''}${editable ? '' : ` <span class="muted">x ${l.qty}</span>`}</div>
        ${l.soldOut ? '<div class="stock out">Stok habis</div>' : ''}
        <div class="row">
          ${editable ? `<div class="qty"><button data-dec aria-label="Kurangi">−</button><span>${l.qty}</span><button data-inc aria-label="Tambah" ${l.qty >= Math.min(l.p.stock, 99) ? 'disabled' : ''}>+</button></div>` : '<span></span>'}
          <strong>${rupiah(l.subtotal)}</strong>
          ${editable ? '<button class="link-del" data-del>Hapus</button>' : ''}
        </div>
      </div>
    </div>`;

  WU.summaryHtml = (d) => `
    <div class="sum-row"><span>Subtotal (harga normal)</span><span>${rupiah(d.normalTotal)}</span></div>
    ${d.normalTotal > d.total ? `<div class="sum-row save"><span>Hemat promo</span><span>-${rupiah(d.normalTotal - d.total)}</span></div>` : ''}
    <div class="sum-row total"><span>Total belanja</span><span>${rupiah(d.total)}</span></div>`;

  async function initCartPage() {
    const root = $('#cart'), notes = $('#cart-notes');
    async function render() {
      let d;
      try { d = await WU.cart.load(); } catch (e) { root.innerHTML = `<p class="form-error">${esc(e.message)}</p>`; return; }
      notes.innerHTML = d.notes.map((n) => `<div class="note">${esc(n)}</div>`).join('');
      if (!d.lines.length) { root.innerHTML = '<div class="empty panel" style="grid-column:1/-1"><span class="big">🛒</span><p>Keranjang masih kosong.</p><a class="btn primary" href="/products">Mulai belanja</a></div>'; return; }
      const blocked = d.lines.some((l) => l.soldOut) || d.total <= 0;
      root.innerHTML = `
        <div class="panel"><h2>Produk dipilih</h2>${d.lines.map((l) => WU.lineHtml(l, true)).join('')}</div>
        <aside class="panel"><h2>Ringkasan</h2>${WU.summaryHtml(d)}
          <a class="btn primary block" style="margin-top:12px" href="${blocked ? '#' : '/checkout'}" ${blocked ? 'aria-disabled="true" onclick="return false" disabled' : ''}>Lanjut ke checkout</a>
          <p class="muted small">Harga dan stok dicek ulang oleh server saat checkout.</p>
        </aside>`;
    }
    root.addEventListener('click', (e) => {
      const line = e.target.closest('.line');
      if (!line) return;
      const id = line.dataset.id;
      const cur = WU.cart.read().find((i) => i.id === id);
      if (e.target.closest('[data-inc]')) WU.cart.setQty(id, cur.qty + 1);
      else if (e.target.closest('[data-dec]')) WU.cart.setQty(id, cur.qty - 1);
      else if (e.target.closest('[data-del]')) WU.cart.remove(id);
      else return;
      render();
    });
    render();
  }

  updateBadge();
  if (document.body.dataset.page === 'cart') initCartPage();
})();
