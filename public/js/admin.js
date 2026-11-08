/* WARUNG UMI - admin.js: login + dashboard admin.
   Semua data lewat /api/admin/* (server memeriksa login & role admin di setiap request). */
(function () {
  'use strict';
  const SKEY = 'wu_admin_session';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rupiah = (n) => 'Rp' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  // Rumus yang sama dengan backend: Harga Promo = Normal - (Normal x Diskon / 100)
  const calcPromo = (normal, pct) => Math.round(normal - (normal * pct) / 100);
  const fmtDate = (d) => (d ? new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
  const toLocalInput = (iso) => {
    if (!iso) return '';
    const d = new Date(iso), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const getSession = () => { try { return JSON.parse(localStorage.getItem(SKEY)); } catch { return null; } };
  const setSession = (s) => localStorage.setItem(SKEY, JSON.stringify(s));
  const clearSession = () => localStorage.removeItem(SKEY);

  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- Request ke API ----------
  async function raw(path, { method = 'GET', body, token } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try { res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }); }
    catch { throw new Error('Tidak dapat terhubung ke server'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Terjadi kesalahan'); e.status = res.status; e.code = data.code; throw e; }
    return data;
  }
  let refreshing;
  function refresh() {
    const s = getSession();
    if (!s?.refresh_token) return Promise.reject(new Error('no session'));
    refreshing = refreshing || raw('/api/admin/auth?action=refresh', { method: 'POST', body: { refresh_token: s.refresh_token } })
      .then((r) => setSession({ access_token: r.access_token, refresh_token: r.refresh_token }))
      .finally(() => { refreshing = null; });
    return refreshing;
  }
  function toLogin() { clearSession(); location.replace('/admin/login'); return new Promise(() => {}); }
  async function api(path, opts = {}) {
    const s = getSession();
    if (!s) return toLogin();
    try { return await raw(path, { ...opts, token: s.access_token }); }
    catch (e) {
      if (e.status === 401) {
        try { await refresh(); return await raw(path, { ...opts, token: getSession().access_token }); } catch { return toLogin(); }
      }
      throw e;
    }
  }

  // ---------- Halaman login ----------
  function initLogin() {
    const form = $('#login-form'), err = $('#login-error'), btn = $('#login-btn');
    const s = getSession();
    if (s) raw('/api/admin/auth?action=me', { token: s.access_token }).then(() => location.replace('/admin/dashboard')).catch(() => {});
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      const username = form.username.value.trim().toLowerCase(), password = form.password.value;
      if (!username || !password) { err.textContent = 'Username dan password wajib diisi.'; err.hidden = false; return; }
      btn.disabled = true; btn.textContent = 'Memeriksa...';
      try {
        const r = await raw('/api/admin/auth?action=login', { method: 'POST', body: { username, password } });
        setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
        location.href = '/admin/dashboard';
      } catch (ex) {
        err.textContent = ex.message; err.hidden = false;
        btn.disabled = false; btn.textContent = 'Masuk';
      }
    });
  }

  // ---------- Modal ----------
  function modal(title, bodyHtml, onSubmit, { wide = false, submitText = 'Simpan' } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="x" aria-label="Tutup">×</button></div>
      <form class="modal-body" novalidate>${bodyHtml}<p class="form-error" hidden></p>
        <div class="modal-actions"><button type="button" class="btn" data-close>${onSubmit ? 'Batal' : 'Tutup'}</button>${onSubmit ? `<button class="btn primary">${submitText}</button>` : ''}</div>
      </form></div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('.x,[data-close]')) close(); });
    const form = $('form', wrap), errEl = $('.form-error', wrap);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!onSubmit) return close();
      errEl.hidden = true;
      const b = $('.btn.primary', wrap); b.disabled = true;
      try { await onSubmit(form, close); } catch (ex) { errEl.textContent = ex.message; errEl.hidden = false; }
      finally { b.disabled = false; }
    });
    const first = $('input:not([type=hidden]),select,textarea', form); if (first) first.focus();
    return { form, close };
  }
  const confirmBox = (msg, onYes, label = 'Hapus') => modal('Konfirmasi', `<p>${esc(msg)}</p>`, async (f, close) => { await onYes(); close(); }, { submitText: label });

  // ---------- Upload gambar (diperkecil di browser dulu) ----------
  function resizeImage(file, max = 900) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Pilih file gambar JPG, PNG, atau WEBP'));
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => reject(new Error('Gambar tidak dapat dibaca'));
      img.src = URL.createObjectURL(file);
    });
  }
  async function uploadImage(file, folder) {
    const data = await resizeImage(file, folder === 'banners' ? 1600 : 900);
    return (await api('/api/admin/upload', { method: 'POST', body: { data, content_type: 'image/jpeg', folder } })).url;
  }
  // Menyambungkan <input type=file> ke input hidden [name=...] + pratinjau
  function wireUpload(form, hiddenName, folder) {
    const file = $('input[type=file]', form), hidden = form.elements[hiddenName], prev = $('.img-prev', form), msg = $('.upload-msg', form);
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      msg.textContent = 'Mengunggah...';
      try { hidden.value = await uploadImage(file.files[0], folder); prev.src = hidden.value; prev.hidden = false; msg.textContent = 'Foto terunggah.'; }
      catch (e) { msg.textContent = e.message; }
    });
  }

  const state = { view: 'overview', locked: false, categories: [] };
  const TITLES = { overview: 'Ringkasan', products: 'Produk', categories: 'Kategori', orders: 'Pesanan', settings: 'Pengaturan Toko', account: 'Akun & Password' };

  // ---------- Ringkasan ----------
  async function viewOverview(root) {
    const d = await api('/api/admin/dashboard');
    const st = d.orders_by_status;
    root.innerHTML = `
      <div class="cards">
        <div class="stat"><b>${d.total_products}</b><span>Total produk</span></div>
        <div class="stat green"><b>${d.available_products}</b><span>Produk tersedia</span></div>
        <div class="stat red"><b>${d.out_of_stock}</b><span>Stok habis</span></div>
        <div class="stat"><b>${d.categories}</b><span>Kategori</span></div>
        <div class="stat green"><b>${d.active_promos}</b><span>Promo aktif</span></div>
        <div class="stat"><b>${d.total_orders}</b><span>Pesanan tercatat</span></div>
        <div class="stat"><b>${st['Menunggu konfirmasi'] || 0}</b><span>Menunggu konfirmasi</span></div>
        <div class="stat"><b>${st['Diproses'] || 0}</b><span>Diproses</span></div>
      </div>
      <div class="note">“Pesanan tercatat” hanya pesanan yang berhasil tersimpan di sistem. Pelanggan yang hanya membuka WhatsApp tanpa checkout tidak tercatat di sini.</div>
      <div class="panel"><h2>Aktivitas terbaru</h2>
        ${d.activity.length ? `<ul class="activity">${d.activity.map((a) => `<li><span>${a.type === 'order' ? '🧾' : '📦'} ${esc(a.text)}</span><span class="muted small">${fmtDate(a.at)}</span></li>`).join('')}</ul>` : '<p class="muted">Belum ada aktivitas.</p>'}
      </div>`;
  }

  // ---------- Produk ----------
  async function viewProducts(root) {
    const [{ products }, { categories }] = await Promise.all([api('/api/admin/products'), api('/api/categories')]);
    state.categories = categories;
    root.innerHTML = `
      <div class="toolbar"><input id="p-search" type="search" placeholder="Cari produk..." aria-label="Cari produk"><button id="p-add" class="btn primary">+ Tambah produk</button></div>
      <div class="table-wrap"><table><thead><tr><th>Foto</th><th>Produk</th><th>Kategori</th><th>Harga</th><th>Stok</th><th>Status</th><th>Aksi</th></tr></thead><tbody id="p-body"></tbody></table></div>`;
    const body = $('#p-body');
    function draw(filter = '') {
      const list = products.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));
      body.innerHTML = list.length ? list.map((p) => `
        <tr data-id="${esc(p.id)}">
          <td>${p.image_url ? `<img class="thumb" src="${esc(p.image_url)}" alt="" loading="lazy">` : '<div class="thumb">🛒</div>'}</td>
          <td><strong>${esc(p.name)}</strong>${p.is_featured ? ' <span class="pill blue">Populer</span>' : ''}</td>
          <td>${esc(p.categories?.name || '-')}</td>
          <td>${p.promo_active ? `<span class="old">${rupiah(p.price)}</span><br><strong>${rupiah(p.final_price)}</strong> <span class="pill orange">-${p.discount_applied}%</span>` : rupiah(p.price)}${p.is_discount_active && !p.promo_active ? '<br><span class="pill">Promo terjadwal/berakhir</span>' : ''}</td>
          <td>${p.stock <= 0 ? '<span class="pill red">Habis</span>' : p.stock}</td>
          <td>${p.is_active ? '<span class="pill green">Aktif</span>' : '<span class="pill">Nonaktif</span>'}</td>
          <td class="actions"><button class="btn small" data-edit>Ubah</button><button class="btn small danger" data-del>Hapus</button></td>
        </tr>`).join('') : '<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">Belum ada produk. Klik “+ Tambah produk”.</td></tr>';
    }
    draw();
    $('#p-search').addEventListener('input', (e) => draw(e.target.value));
    $('#p-add').addEventListener('click', () => productForm(null));
    body.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      const p = products.find((x) => x.id === tr.dataset.id);
      if (e.target.closest('[data-edit]')) productForm(p);
      if (e.target.closest('[data-del]')) confirmBox(`Hapus produk "${p.name}"? Tindakan ini tidak bisa dibatalkan.`, async () => { await api('/api/admin/products?id=' + p.id, { method: 'DELETE' }); toast('Produk dihapus'); show('products'); });
    });
  }

  function productForm(p) {
    const isNew = !p;
    p = p || { name: '', description: '', price: '', stock: 0, is_active: true, is_featured: false, is_discount_active: false, discount_percentage: 10 };
    const html = `
      <div class="grid2">
        <label>Nama produk<input name="name" required maxlength="120" value="${esc(p.name)}"></label>
        <label>Kategori<select name="category_id"><option value="">- Tanpa kategori -</option>${state.categories.map((c) => `<option value="${esc(c.id)}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label>Harga normal (Rp)<input name="price" type="number" min="0" step="1" required value="${esc(p.price)}"></label>
        <label>Stok<input name="stock" type="number" min="0" step="1" required value="${esc(p.stock)}"></label>
      </div>
      <label>Deskripsi<textarea name="description" rows="3" maxlength="1000">${esc(p.description)}</textarea></label>
      <label>Foto produk<input type="file" accept="image/jpeg,image/png,image/webp"><input type="hidden" name="image_url" value="${esc(p.image_url || '')}">
        <img class="img-prev" alt="Pratinjau foto" ${p.image_url ? `src="${esc(p.image_url)}"` : 'hidden'}><span class="upload-msg muted small"></span></label>
      <label class="check"><input type="checkbox" name="is_active" ${p.is_active ? 'checked' : ''}> Aktif (tampil di toko)</label>
      <label class="check"><input type="checkbox" name="is_featured" ${p.is_featured ? 'checked' : ''}> Tampilkan di “Produk Populer”</label>
      <div class="promo-box">
        <label class="check"><input type="checkbox" name="is_discount_active" ${p.is_discount_active ? 'checked' : ''}> Aktifkan diskon / promo</label>
        <div class="grid2">
          <label>Persentase diskon (1-90%)<input name="discount_percentage" type="number" min="0" max="90" step="1" value="${esc(p.discount_percentage || 0)}"></label>
          <label>Harga setelah diskon<input id="promo-preview" class="preview" readonly></label>
          <label>Mulai promo (kosong = langsung)<input name="discount_start" type="datetime-local" value="${toLocalInput(p.discount_start)}"></label>
          <label>Berakhir (kosong = tanpa batas)<input name="discount_end" type="datetime-local" value="${toLocalInput(p.discount_end)}"></label>
        </div>
        <p class="muted small" style="margin:0">Harga normal tetap tersimpan. Setelah promo berakhir, harga di toko otomatis kembali normal.</p>
      </div>`;
    const { form } = modal(isNew ? 'Tambah produk' : 'Ubah produk', html, async (f, close) => {
      const fd = new FormData(f);
      const payload = {
        name: fd.get('name'), category_id: fd.get('category_id') || null, description: fd.get('description'),
        price: Number(fd.get('price')), stock: Number(fd.get('stock')), image_url: fd.get('image_url') || null,
        is_active: fd.has('is_active'), is_featured: fd.has('is_featured'), is_discount_active: fd.has('is_discount_active'),
        discount_percentage: Number(fd.get('discount_percentage') || 0),
        discount_start: fd.get('discount_start') ? new Date(fd.get('discount_start')).toISOString() : null,
        discount_end: fd.get('discount_end') ? new Date(fd.get('discount_end')).toISOString() : null,
      };
      if (!payload.name.trim()) throw new Error('Nama produk wajib diisi');
      if (!Number.isInteger(payload.price) || payload.price < 0) throw new Error('Harga normal tidak valid');
      if (!Number.isInteger(payload.stock) || payload.stock < 0) throw new Error('Stok tidak valid');
      if (payload.is_discount_active && (payload.discount_percentage < 1 || payload.discount_percentage > 90)) throw new Error('Persentase diskon harus 1-90');
      if (isNew) await api('/api/admin/products', { method: 'POST', body: payload });
      else await api('/api/admin/products?id=' + p.id, { method: 'PUT', body: payload });
      close(); toast('Produk tersimpan'); show('products');
    }, { wide: true });
    wireUpload(form, 'image_url', 'products');
    const prev = $('#promo-preview', form);
    const upd = () => {
      const price = Number(form.elements.price.value), pct = Number(form.elements.discount_percentage.value);
      prev.value = price >= 0 && pct > 0 && pct <= 90 ? `${rupiah(calcPromo(price, pct))} (hemat ${rupiah(price - calcPromo(price, pct))})` : '-';
    };
    form.addEventListener('input', upd); upd();
  }

  // ---------- Kategori ----------
  async function viewCategories(root) {
    const { categories } = await api('/api/admin/categories');
    root.innerHTML = `
      <div class="toolbar"><button id="c-add" class="btn primary">+ Tambah kategori</button></div>
      <div class="table-wrap"><table><thead><tr><th>Nama kategori</th><th>Aksi</th></tr></thead><tbody>
      ${categories.map((c) => `<tr data-id="${esc(c.id)}"><td>${esc(c.name)}</td><td class="actions"><button class="btn small" data-edit>Ubah</button><button class="btn small danger" data-del>Hapus</button></td></tr>`).join('') || '<tr><td colspan="2" class="muted">Belum ada kategori.</td></tr>'}
      </tbody></table></div>`;
    const form = (c) => modal(c ? 'Ubah kategori' : 'Tambah kategori', `<label>Nama kategori<input name="name" required maxlength="60" value="${esc(c?.name || '')}"></label>`, async (f, close) => {
      const name = f.elements.name.value.trim(); if (!name) throw new Error('Nama kategori wajib diisi');
      await api('/api/admin/categories' + (c ? '?id=' + c.id : ''), { method: c ? 'PUT' : 'POST', body: { name } });
      close(); toast('Kategori tersimpan'); show('categories');
    });
    $('#c-add').addEventListener('click', () => form(null));
    root.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      const c = categories.find((x) => x.id === tr.dataset.id);
      if (e.target.closest('[data-edit]')) form(c);
      if (e.target.closest('[data-del]')) confirmBox(`Hapus kategori "${c.name}"? Produk di dalamnya menjadi “tanpa kategori”.`, async () => { await api('/api/admin/categories?id=' + c.id, { method: 'DELETE' }); toast('Kategori dihapus'); show('categories'); });
    });
  }

  // ---------- Pesanan ----------
  const STATUSES = ['Menunggu konfirmasi', 'Diproses', 'Selesai', 'Dibatalkan'];
  const statusClass = { 'Menunggu konfirmasi': 'orange', Diproses: 'blue', Selesai: 'green', Dibatalkan: 'red' };
  async function viewOrders(root) {
    const { orders } = await api('/api/admin/orders');
    root.innerHTML = `
      <div class="note">Daftar ini hanya berisi pesanan yang <b>tersimpan di sistem</b>. “Dibayar” diisi manual oleh admin setelah pembayaran benar-benar diterima; membuka WhatsApp tidak berarti sudah bayar.</div>
      <div class="table-wrap"><table><thead><tr><th>Kode</th><th>Tanggal</th><th>Pelanggan</th><th>Total</th><th>Status</th><th>Dibayar</th><th></th></tr></thead><tbody>
      ${orders.map((o) => `<tr data-id="${esc(o.id)}">
        <td><strong>${esc(o.order_code)}</strong></td><td>${fmtDate(o.created_at)}</td>
        <td>${esc(o.customer_name)}<br><span class="muted small">${o.delivery_method === 'diantar' ? 'Diantar' : 'Ambil sendiri'}</span></td>
        <td>${rupiah(o.total)}</td>
        <td><select data-status>${STATUSES.map((s) => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td><label class="check" style="margin:0"><input type="checkbox" data-paid ${o.is_paid ? 'checked' : ''}> ${o.is_paid ? 'Ya' : 'Belum'}</label></td>
        <td><button class="btn small" data-detail>Detail</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">Belum ada pesanan tersimpan.</td></tr>'}
      </tbody></table></div>`;
    root.addEventListener('change', async (e) => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      const patch = e.target.matches('[data-status]') ? { status: e.target.value } : e.target.matches('[data-paid]') ? { is_paid: e.target.checked } : null;
      if (!patch) return;
      try { await api('/api/admin/orders?id=' + tr.dataset.id, { method: 'PATCH', body: patch }); toast('Pesanan diperbarui'); show('orders'); }
      catch (ex) { toast(ex.message); show('orders'); }
    });
    root.addEventListener('click', (e) => {
      if (!e.target.closest('[data-detail]')) return;
      const o = orders.find((x) => x.id === e.target.closest('tr').dataset.id);
      modal(`Pesanan ${o.order_code}`, `
        <p><span class="pill ${statusClass[o.status]}">${esc(o.status)}</span> ${o.is_paid ? '<span class="pill green">Dibayar</span>' : '<span class="pill">Belum dibayar</span>'}</p>
        <p><b>${esc(o.customer_name)}</b><br>HP: <a href="https://wa.me/${esc(o.customer_phone)}" target="_blank" rel="noopener">${esc(o.customer_phone)}</a><br>
        ${o.delivery_method === 'diantar' ? `Diantar ke: ${esc(o.customer_address)}` : 'Ambil sendiri di toko'}<br>${o.notes ? `Catatan: ${esc(o.notes)}` : ''}</p>
        <table><thead><tr><th>Produk</th><th>Jml</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody>
        ${o.order_items.map((i) => `<tr><td>${esc(i.product_name)}</td><td>${i.quantity}</td><td>${i.discount_percentage > 0 ? `<span class="old">${rupiah(i.unit_price_normal)}</span><br>` : ''}${rupiah(i.unit_price_final)}${i.discount_percentage > 0 ? ` <span class="pill orange">-${i.discount_percentage}%</span>` : ''}</td><td>${rupiah(i.line_total)}</td></tr>`).join('')}
        </tbody></table><p style="text-align:right"><b>Total: ${rupiah(o.total)}</b></p>`, null, { wide: true });
    });
  }

  // ---------- Pengaturan toko ----------
  async function viewSettings(root) {
    const { settings: s } = await api('/api/admin/settings');
    root.innerHTML = `<form id="set-form" class="panel" novalidate>
      <div class="grid2">
        <label>Nama toko<input name="store_name" required maxlength="80" value="${esc(s.store_name)}"></label>
        <label>Nomor WhatsApp pesanan<input name="whatsapp_number" required maxlength="20" value="0${esc(String(s.whatsapp_number).replace(/^62/, ''))}"></label>
      </div>
      <label>Alamat toko<textarea name="address" rows="2" maxlength="300">${esc(s.address)}</textarea></label>
      <label>Deskripsi toko<textarea name="description" rows="2" maxlength="500">${esc(s.description)}</textarea></label>
      <div class="grid2">
        <label>Judul banner promosi<input name="banner_title" maxlength="80" value="${esc(s.banner_title)}"></label>
        <label>Teks banner<input name="banner_text" maxlength="200" value="${esc(s.banner_text)}"></label>
      </div>
      <label>Gambar banner (opsional)<input type="file" accept="image/jpeg,image/png,image/webp"><input type="hidden" name="banner_url" value="${esc(s.banner_url || '')}">
        <img class="img-prev" style="width:220px;height:90px" alt="Pratinjau banner" ${s.banner_url ? `src="${esc(s.banner_url)}"` : 'hidden'}><span class="upload-msg muted small"></span></label>
      <p id="set-msg" class="form-error" hidden></p>
      <button class="btn primary">Simpan pengaturan</button></form>`;
    const form = $('#set-form'), msg = $('#set-msg');
    wireUpload(form, 'banner_url', 'banners');
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); msg.hidden = true;
      const fd = Object.fromEntries(new FormData(form));
      try { await api('/api/admin/settings', { method: 'PUT', body: fd }); toast('Pengaturan tersimpan'); }
      catch (ex) { msg.textContent = ex.message; msg.hidden = false; }
    });
  }

  // ---------- Akun & password ----------
  async function viewAccount(root) {
    root.innerHTML = `
      ${state.locked ? '<div class="note"><b>Wajib:</b> Anda masih memakai password awal. Ganti password sekarang sebelum memakai dashboard.</div>' : ''}
      <form id="pw-form" class="panel" style="max-width:460px" novalidate>
        <h2>Ganti password</h2>
        <label>Password saat ini<input name="current_password" type="password" autocomplete="current-password" required></label>
        <label>Password baru (min. 10 karakter, ada huruf & angka)<input name="new_password" type="password" autocomplete="new-password" required minlength="10"></label>
        <label>Ulangi password baru<input name="confirm" type="password" autocomplete="new-password" required></label>
        <p id="pw-msg" class="form-error" hidden></p>
        <button class="btn primary">Simpan password baru</button>
      </form>`;
    const form = $('#pw-form'), msg = $('#pw-msg');
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); msg.hidden = true; msg.className = 'form-error';
      const f = form.elements;
      if (f.new_password.value !== f.confirm.value) { msg.textContent = 'Konfirmasi password tidak sama.'; msg.hidden = false; return; }
      try {
        await api('/api/admin/auth?action=password', { method: 'POST', body: { current_password: f.current_password.value, new_password: f.new_password.value } });
        state.locked = false; toast('Password berhasil diganti'); show('overview');
      } catch (ex) { msg.textContent = ex.message; msg.hidden = false; }
    });
  }

  const VIEWS = { overview: viewOverview, products: viewProducts, categories: viewCategories, orders: viewOrders, settings: viewSettings, account: viewAccount };
  async function show(name) {
    if (state.locked && name !== 'account') { toast('Ganti password terlebih dahulu'); name = 'account'; }
    state.view = name;
    $('#view-title').textContent = TITLES[name];
    document.querySelectorAll('#menu button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    const root = $('#view');
    const fresh = root.cloneNode(false); root.replaceWith(fresh); // buang listener lama
    fresh.innerHTML = '<p class="loading">Memuat...</p>';
    try { await VIEWS[name](fresh); }
    catch (e) {
      if (e.code === 'PASSWORD_CHANGE_REQUIRED') { state.locked = true; return show('account'); }
      fresh.innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
    }
  }

  // ---------- Dashboard ----------
  async function initDashboard() {
    if (!getSession()) return toLogin();
    let me;
    try { me = await api('/api/admin/auth?action=me'); } catch { return toLogin(); } // bukan admin / sesi tidak valid
    $('#shell').hidden = false;
    $('#who').textContent = me.username;
    $('#menu').addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (b) show(b.dataset.view); });
    $('#logout').addEventListener('click', async () => {
      const s = getSession();
      try { await raw('/api/admin/auth?action=logout', { method: 'POST', token: s?.access_token }); } catch { /* abaikan */ }
      toLogin();
    });
    state.locked = !!me.must_change_password;
    show(state.locked ? 'account' : 'overview');
  }

  if (document.body.dataset.page === 'login') initLogin();
  else if (document.body.dataset.page === 'dashboard') initDashboard();
})();
