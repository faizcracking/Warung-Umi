/* WARUNG UMI - shop.js: fungsi umum + halaman Beranda, Produk, dan Promo. */
(function () {
  'use strict';
  const WU = (window.WU = window.WU || {});
  const $ = (s, r = document) => r.querySelector(s);

  // ---------- Utilitas ----------
  WU.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  WU.rupiah = (n) => 'Rp' + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  // Rumus: Harga Promo = Harga Normal - (Harga Normal x Persentase Diskon / 100)
  // (Tampilan memakai harga dari server; rumus ini dipakai untuk pratinjau di admin.)
  WU.calcPromoPrice = (normal, pct) => Math.round(normal - (normal * pct) / 100);
  const esc = WU.esc, rupiah = WU.rupiah;

  WU.api = async (url, options) => {
    let res;
    try { res = await fetch(url, options); } catch { throw new Error('Tidak dapat terhubung ke server. Periksa koneksi internet.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
    return data;
  };

  let toastTimer;
  WU.toast = (msg) => {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  };

  const FALLBACK = { store_name: 'Warung Umi', whatsapp_number: '6285213205216', address: '', description: '', banner_url: null, banner_title: '', banner_text: '' };
  let settingsP;
  WU.getSettings = () => (settingsP = settingsP || WU.api('/api/settings').then((r) => r.settings).catch(() => FALLBACK));

  // ---------- Header & footer ----------
  async function renderLayout() {
    const page = document.body.dataset.page;
    const links = [['home', '/', 'Beranda'], ['products', '/products', 'Produk'], ['promo', '/promo', 'Promo'], ['cart', '/cart', 'Keranjang']];
    $('#site-header').innerHTML = `
      <div class="hdr">
        <a class="brand" href="/" aria-label="Beranda Warung Umi"><img src="/assets/logo.svg" alt=""><span class="brand-name">Warung Umi</span></a>
        <form class="search" action="/products" method="get" role="search">
          <input name="q" type="search" placeholder="Cari produk..." maxlength="60" aria-label="Cari produk">
          <button type="submit">Cari</button>
        </form>
        <a class="cart-btn" href="/cart" aria-label="Keranjang belanja">🛒<span id="cart-count" class="badge" hidden>0</span></a>
      </div>
      <nav class="nav" aria-label="Menu utama"><div>${links.map(([k, h, t]) => `<a href="${h}" class="${k === page || (k === 'cart' && page === 'checkout') ? 'active' : ''}">${t}</a>`).join('')}</div></nav>`;

    const s = await WU.getSettings();
    $('.brand-name').textContent = s.store_name;
    document.title = document.title.replace('Warung Umi', s.store_name);
    $('#site-footer').innerHTML = `
      <div class="ft">
        <div><h4>${esc(s.store_name)}</h4><p>${esc(s.description)}</p></div>
        <div><h4>Alamat toko</h4><p>${esc(s.address) || '-'}</p></div>
        <div><h4>Pesan lewat WhatsApp</h4><p><a href="https://wa.me/${esc(s.whatsapp_number)}" target="_blank" rel="noopener">+${esc(s.whatsapp_number)}</a></p><p class="small">Pesanan dikonfirmasi oleh toko lewat WhatsApp.</p></div>
      </div>`;
  }

  // ---------- Kartu produk ----------
  WU.productCard = (p) => {
    const out = p.stock <= 0;
    const promo = p.promo_active;
    const stockTxt = out ? 'Stok habis' : p.stock <= 5 ? `Sisa ${p.stock}` : `Stok: ${p.stock}`;
    const end = promo && p.discount_end ? `<span class="promo-end">Promo s.d. ${new Date(p.discount_end).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>` : '';
    return `
      <article class="card ${out ? 'sold-out' : ''}">
        <div class="card-img">
          ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">` : '<span>🛒</span>'}
          ${promo ? `<span class="badge-promo">PROMO</span><span class="badge-off">-${p.discount_applied}%</span>` : ''}
          ${out ? '<span class="sold-badge">Stok habis</span>' : ''}
        </div>
        <div class="card-body">
          <span class="cat">${esc(p.categories?.name || 'Lain-lain')}</span>
          <h3>${esc(p.name)}</h3>
          <div class="price"><span class="now ${promo ? 'promo' : ''}">${rupiah(p.final_price)}</span>${promo ? `<s>${rupiah(p.price)}</s>` : ''}</div>
          ${end}
          <span class="stock ${out ? 'out' : p.stock <= 5 ? 'low' : ''}">${stockTxt}</span>
          <button class="btn primary" data-add="${esc(p.id)}" data-stock="${p.stock}" ${out ? 'disabled' : ''}>${out ? 'Stok habis' : '+ Keranjang'}</button>
        </div>
      </article>`;
  };

  WU.renderGrid = (el, products, emptyMsg) => {
    el.innerHTML = products.length ? products.map(WU.productCard).join('') : `<p class="empty" style="grid-column:1/-1">${esc(emptyMsg || 'Belum ada produk.')}</p>`;
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (b && WU.cart) WU.cart.add(b.dataset.add, 1, Number(b.dataset.stock));
  });

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const gridError = (el, e) => (el.innerHTML = `<p class="form-error" style="grid-column:1/-1">${esc(e.message)}</p>`);

  // ---------- Beranda ----------
  async function initHome() {
    const root = $('#home');
    const [s, cats] = await Promise.all([WU.getSettings(), WU.api('/api/categories').then((r) => r.categories).catch(() => [])]);
    const sections = [
      { title: '🔥 Produk Diskon', view: 'promo', more: '/promo' },
      { title: 'Produk Populer', view: 'popular', more: '/products' },
      { title: 'Produk Terbaru', view: 'newest', more: '/products' },
      { title: 'Rekomendasi Untuk Anda', view: 'recommended', more: '/products' },
    ];
    let results;
    try { results = await Promise.all(sections.map((x) => WU.api(`/api/products?view=${x.view}&limit=8`).then((r) => r.products))); }
    catch (e) { root.innerHTML = `<p class="form-error">${esc(e.message)}</p>`; return; }

    const heroStyle = s.banner_url ? `style="background-image:url('${esc(encodeURI(s.banner_url))}')"` : '';
    root.innerHTML = `
      <div class="chips">${cats.map((c) => `<a class="chip" href="/products?category=${encodeURIComponent(c.slug)}">${esc(c.name)}</a>`).join('')}</div>
      <section class="hero ${s.banner_url ? 'has-img' : ''}" ${heroStyle}>
        <h1>${esc(s.banner_title || s.store_name)}</h1>
        <p>${esc(s.banner_text || s.description)}</p>
        <div class="actions"><a class="btn primary" href="/products">Belanja sekarang</a><a class="btn" href="/promo">Lihat promo</a></div>
      </section>
      ${results[0].length ? '<div class="promo-banner" style="margin-top:14px"><strong>Lagi promo!</strong><span>Harga spesial untuk produk pilihan, selama persediaan masih ada.</span></div>' : ''}
      ${sections.map((x, i) => results[i].length ? `
        <section class="section">
          <div class="section-head"><h2>${x.title}</h2><a href="${x.more}">Lihat semua</a></div>
          <div class="grid">${results[i].map(WU.productCard).join('')}</div>
        </section>` : '').join('')}
      ${results.every((r) => !r.length) ? '<p class="empty"><span class="big">🛒</span><br>Produk belum tersedia. Silakan kembali lagi nanti.</p>' : ''}`;
  }

  // ---------- Katalog ----------
  async function initProducts() {
    const params = new URLSearchParams(location.search);
    const q = $('#f-q'), cat = $('#f-cat'), sort = $('#f-sort'), grid = $('#grid'), count = $('#count');
    try {
      const { categories } = await WU.api('/api/categories');
      cat.innerHTML += categories.map((c) => `<option value="${esc(c.slug)}">${esc(c.name)}</option>`).join('');
    } catch { /* filter kategori tetap kosong */ }
    q.value = params.get('q') || '';
    cat.value = params.get('category') || '';
    sort.value = params.get('sort') || 'newest';

    let seq = 0;
    async function load() {
      const my = ++seq;
      const qs = new URLSearchParams({ sort: sort.value });
      if (q.value.trim()) qs.set('q', q.value.trim());
      if (cat.value) qs.set('category', cat.value);
      history.replaceState(null, '', '?' + qs);
      grid.innerHTML = '<p class="loading" style="grid-column:1/-1">Memuat produk...</p>';
      try {
        const { products } = await WU.api('/api/products?' + qs);
        if (my !== seq) return;
        count.textContent = `${products.length} produk`;
        WU.renderGrid(grid, products, 'Produk tidak ditemukan. Coba kata kunci atau kategori lain.');
      } catch (e) { gridError(grid, e); }
    }
    q.addEventListener('input', debounce(load, 300));
    cat.addEventListener('change', load);
    sort.addEventListener('change', load);
    load();
  }

  // ---------- Promo ----------
  async function initPromo() {
    const grid = $('#grid');
    const tabs = document.querySelectorAll('.tab');
    async function load(view) {
      tabs.forEach((t) => t.classList.toggle('active', t.dataset.view === view));
      grid.innerHTML = '<p class="loading" style="grid-column:1/-1">Memuat promo...</p>';
      try { WU.renderGrid(grid, (await WU.api('/api/products?view=' + view)).products, 'Belum ada promo saat ini. Cek lagi nanti ya!'); }
      catch (e) { gridError(grid, e); }
    }
    tabs.forEach((t) => t.addEventListener('click', () => load(t.dataset.view)));
    load('promo');
  }

  renderLayout();
  const page = document.body.dataset.page;
  if (page === 'home') initHome();
  if (page === 'products') initProducts();
  if (page === 'promo') initPromo();
})();
