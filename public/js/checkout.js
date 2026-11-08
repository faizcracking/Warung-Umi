/* WARUNG UMI - checkout.js: form pemesan -> simpan pesanan ke server -> buka WhatsApp. */
(function () {
  'use strict';
  const WU = window.WU;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = WU.esc, rupiah = WU.rupiah;
  const form = $('#order-form'), errEl = $('#form-error'), btn = $('#submit-btn');
  let cartData = { lines: [], total: 0 };

  const showError = (m) => { errEl.textContent = m; errEl.hidden = false; errEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); };

  async function loadSummary() {
    const box = $('#summary');
    try { cartData = await WU.cart.load(); } catch (e) { box.innerHTML = `<p class="form-error">${esc(e.message)}</p>`; btn.disabled = true; return; }
    if (!cartData.lines.length) {
      $('#checkout').innerHTML = '<div class="empty panel" style="grid-column:1/-1"><span class="big">🛒</span><p>Keranjang masih kosong.</p><a class="btn primary" href="/products">Mulai belanja</a></div>';
      return;
    }
    const soldOut = cartData.lines.some((l) => l.soldOut);
    box.innerHTML = `<h2>Ringkasan belanja</h2>
      ${cartData.notes.map((n) => `<div class="note">${esc(n)}</div>`).join('')}
      ${cartData.lines.map((l) => WU.lineHtml(l, false)).join('')}
      ${WU.summaryHtml(cartData)}
      <p><a href="/cart" class="small">← Ubah keranjang</a></p>`;
    btn.disabled = soldOut;
    if (soldOut) showError('Ada produk yang stoknya habis. Kembali ke keranjang dan hapus produk tersebut.');
  }

  form.addEventListener('change', (e) => {
    if (e.target.name === 'delivery') $('#address-wrap').hidden = e.target.value !== 'diantar';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const f = new FormData(form);
    const name = String(f.get('name') || '').trim();
    const phone = String(f.get('phone') || '').trim();
    const delivery = f.get('delivery');
    const address = String(f.get('address') || '').trim();

    if (name.length < 2) return showError('Nama wajib diisi.');
    if (!/^(\+62|62|0)8[0-9]{7,12}$/.test(phone.replace(/[\s-]/g, ''))) return showError('Nomor HP tidak valid. Contoh: 08123456789');
    if (delivery === 'diantar' && address.length < 10) return showError('Alamat lengkap wajib diisi untuk pesanan diantar.');
    const items = WU.cart.read();
    if (!items.length) return showError('Keranjang kosong.');

    btn.disabled = true;
    btn.textContent = 'Menyimpan pesanan...';
    try {
      // Hanya id & jumlah yang dikirim. Harga dihitung ulang oleh server.
      const r = await WU.api('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, delivery, address, notes: f.get('notes'), website: f.get('website'), items }),
      });
      WU.cart.clear();
      showDone(r);
    } catch (err) {
      showError(err.message + ' Pesanan BELUM tersimpan.');
      btn.disabled = false;
      btn.textContent = 'Simpan pesanan & lanjut ke WhatsApp';
      loadSummary();
    }
  });

  function showDone(r) {
    $('#checkout').hidden = true;
    const done = $('#done');
    done.hidden = false;
    done.innerHTML = `
      <div class="tick">✅</div>
      <h2>Pesanan tersimpan</h2>
      <div class="code">${esc(r.order.code)}</div>
      <p>Total: <strong>${rupiah(r.order.total)}</strong>${r.order.saving > 0 ? ` (hemat ${rupiah(r.order.saving)})` : ''}</p>
      <p><strong>Langkah terakhir:</strong> kirim pesanan ke WhatsApp toko agar segera dikonfirmasi. Pesanan belum dianggap dibayar.</p>
      <a id="wa-btn" class="btn wa block" href="${esc(r.whatsapp_url)}" target="_self" rel="noopener">Buka WhatsApp Warung Umi</a>
      <p class="muted small" id="wa-wait">Anda akan diarahkan otomatis...</p>
      <p><a href="/products">Lanjut belanja</a></p>`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => { location.href = r.whatsapp_url; }, 1800);
  }

  loadSummary();
})();
