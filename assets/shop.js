/* SP Reclamebureau webshop — praat met de shop-api (Cloudflare Worker) */
(() => {
  const API = (document.querySelector('meta[name="sp-shop-api"]')?.content || '').replace(/\/$/, '');
  const $ = (s, el = document) => el.querySelector(s);
  const eur = (n) => '€ ' + Number(n || 0).toFixed(2).replace('.', ',');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pretty = (code) => String(code || '').replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  const INPUT_TYPES = ['width', 'height', 'length', 'amount', 'number', 'input', 'text', 'pages'];

  const store = {
    get() { try { return JSON.parse(localStorage.getItem('sp-cart') || '[]'); } catch { return []; } },
    set(v) { try { localStorage.setItem('sp-cart', JSON.stringify(v)); } catch { /* privémodus */ } },
  };


  const ICONS = {
    drukwerk: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/><path d="M10 12h6M10 16h6"/><path d="M4 6v15h12"/>',
    posters: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="m4 16 5-5 4 4 2-2 5 5"/><circle cx="15.5" cy="8" r="1.6"/>',
    stickers: '<path d="M5 4h14v9l-6 7H5z"/><path d="M19 13h-5a1 1 0 0 0-1 1v6"/><path d="M8.5 9.5h.01M14.5 9.5h.01M9 13c1.6 1.4 4.4 1.4 6 0"/>',
    borden: '<rect x="3" y="4" width="18" height="10" rx="1.5"/><path d="M8 14v7M16 14v7M7 8h10M7 11h6"/>',
    spandoeken: '<path d="M2 6h20v9H2z"/><circle cx="4.5" cy="8" r=".8"/><circle cx="19.5" cy="8" r=".8"/><circle cx="4.5" cy="13" r=".8"/><circle cx="19.5" cy="13" r=".8"/><path d="M8 10.5h8"/><path d="M2 6 1 4M22 6l1-2"/>',
    vlaggen: '<path d="M6 21V3"/><path d="M6 4c4-2 7 3 12 1v8c-5 2-8-3-12-1"/>',
    beurs: '<rect x="7" y="2" width="10" height="16" rx="1"/><path d="M5 21h14M12 18v3M10 7h4M10 10h4"/>',
    interieur: '<path d="M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3"/><path d="M2 12a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2z"/><path d="M5 17v3M19 17v3"/>',
    promo: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    montage: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  };
  const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.promo}</svg>`;
  const PAGE = 24;
  const state = { products: [], categories: [], stepNames: [], settings: { shipping_excl: 9.95, vat: 0.21 }, cat: 'Alles', q: '', shown: PAGE, product: null, options: [], result: null, files: [], cart: store.get() };

  async function api(path, opts) {
    const res = await fetch(API + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Er ging iets mis. Probeer het opnieuw.');
    return data;
  }
  const postJSON = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  function showError(el, msg) { el.innerHTML = msg ? `<div class="msg err">${esc(msg)}</div>` : ''; }

  // ---------- catalogus ----------
  function productCard(p) {
    return `<button type="button" class="product-card ${state.product?.code === p.code ? 'active' : ''}" data-code="${esc(p.code)}">
        ${p.image ? `<div class="pc-photo"><img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy"></div>` : `<div class="pc-icon">${icon(p.category_key)}</div>`}
        <div class="pc-body">${state.cat === 'Alles' || state.q ? `<div class="pc-cat">${esc(p.category)}</div>` : ''}<h3>${esc(p.title)}</h3>${p.description ? `<p class="muted">${esc(p.description)}</p>` : ''}</div>
      </button>`;
  }

  function renderCatalog() {
    const q = state.q.toLowerCase();
    const grid = $('#productGrid'), more = $('#moreWrap'), head = $('#catHead');
    // Startscherm: categorieën + populaire producten
    if (state.cat === 'Alles' && !q) {
      head.innerHTML = '';
      $('#catTiles').innerHTML = state.categories.map((c) => `
        <button type="button" class="cat-tile" data-cat="${esc(c.key)}">
          <span class="ct-icon">${icon(c.key)}</span>
          <span class="ct-text"><strong>${esc(c.name)}</strong><small>${esc(c.blurb)}</small></span>
          <span class="ct-count">${c.count}</span>
        </button>`).join('');
      $('#catTiles').hidden = false;
      const featured = state.products.filter((p) => p.featured);
      grid.innerHTML = featured.map(productCard).join('');
      $('#gridTitle').textContent = 'Populair';
      more.innerHTML = '';
      return;
    }
    $('#catTiles').hidden = true;
    const cat = state.categories.find((c) => c.key === state.cat);
    const list = state.products.filter((p) => (q ? `${p.title} ${p.description} ${p.category}`.toLowerCase().includes(q) : p.category_key === state.cat));
    head.innerHTML = `<button type="button" class="back-link" data-cat="Alles">← Alle categorieën</button>`
      + (cat && !q ? `<div class="cat-head-title"><span class="ct-icon">${icon(cat.key)}</span><div><h3>${esc(cat.name)}</h3><p class="muted">${esc(cat.blurb)}</p></div></div>` : '');
    $('#gridTitle').textContent = q ? `${list.length} resultaten voor “${state.q}”` : `${list.length} producten`;
    const visible = list.slice(0, state.shown);
    grid.innerHTML = visible.length ? visible.map(productCard).join('') : '<p class="muted">Geen producten gevonden. Probeer een ander woord of <a class="accent" href="mailto:info@sp-agency.be?subject=Productvraag">vraag het ons</a>.</p>';
    more.innerHTML = list.length > visible.length ? `<button type="button" class="btn outline" id="showMore">Toon meer (${list.length - visible.length})</button>` : '';
  }

  // ---------- configurator ----------
  async function selectProduct(code) {
    state.product = state.products.find((p) => p.code === code);
    state.options = [];
    state.stepNames = [];
    state.files = [];
    renderCatalog();
    const box = $('#configurator');
    box.hidden = false;
    $('#catalogWrap').hidden = true;
    $('#cfgTitle').textContent = state.product.title;
    const ph = $('#cfgPhoto');
    if (ph) { ph.innerHTML = state.product.image ? `<img src="${esc(state.product.image)}" alt="${esc(state.product.title)}">` : ''; ph.hidden = !state.product.image; }
    $('#cfgDesc').textContent = state.product.description;
    $('#shopTop').scrollIntoView({ behavior: 'smooth', block: 'start' });
    await reconfigure();
  }

  async function reconfigure() {
    const body = $('#cfgBody');
    body.classList.add('loading');
    showError($('#cfgMsg'), '');
    try {
      state.result = await postJSON('/api/configure', { code: state.product.code, options: state.options });
      renderConfigurator();
    } catch (e) {
      showError($('#cfgMsg'), e.message);
    } finally {
      body.classList.remove('loading');
    }
  }

  function renderConfigurator() {
    const r = state.result;
    const sel = r.selected_options || [];
    const nameOf = (o) => {
      const s = sel.find((x) => x.code === o.code);
      return (s && s.name) || pretty(o.code);
    };
    // Afgewerkte stappen, gegroepeerd per stapnaam
    const done = [];
    state.options.forEach((o, i) => {
      const group = state.stepNames[i] || '';
      const last = done[done.length - 1];
      const text = o.value !== undefined ? `${nameOf(o)} ${o.value}` : nameOf(o);
      if (last && last.group === group && group) last.parts.push(text);
      else done.push({ group, parts: [text], index: i });
    });
    let step = 0;
    let html = done.map((d) => `
      <div class="step done">
        <span class="step-no">✓</span>
        <div class="step-sum"><span class="muted">${esc(d.group || 'Keuze')}</span><strong>${esc(d.parts.join(' × '))}</strong></div>
        <button type="button" class="step-edit" data-undo="${d.index}" title="Wijzig deze stap" aria-label="Wijzig ${esc(d.group)}">✎</button>
      </div>`).join('');
    step = done.length;

    const inputGroups = [], choiceGroups = [];
    for (const g of r.available_options || []) {
      const kids = g.children || [];
      if (kids.length && kids.every((k) => INPUT_TYPES.includes(k.type_code))) inputGroups.push(g);
      else choiceGroups.push(g);
    }
    if (inputGroups.length) {
      step += 1;
      const title = inputGroups.map((g) => g.name || pretty(g.code)).join(' & ');
      html += `<div class="step open"><div class="step-head"><span class="step-no">${step}</span><h4>${esc(title)}</h4></div>
        <form id="inputForm" class="opt-inputs">`;
      for (const g of inputGroups) {
        for (const k of g.children) {
          const unit = k.unit_code === 'cm' || ['width', 'height', 'length'].includes(k.type_code) ? ' (cm)' : '';
          const min = k.min_value && Number(k.min_value) > 0 ? ` min="${esc(k.min_value)}"` : ' min="1"';
          const max = k.max_value && Number(k.max_value) < 99999 ? ` max="${esc(k.max_value)}"` : '';
          html += `<label class="field">${esc(k.name || pretty(k.code))}${unit}<input type="number" step="any" required name="${esc(k.code)}" data-group="${esc(g.name || pretty(g.code))}"${min}${max}></label>`;
        }
      }
      html += '<button class="btn" type="submit">Verder</button></form></div>';
    }
    for (const g of choiceGroups) {
      step += 1;
      const gname = g.name || pretty(g.code);
      html += `<div class="step open"><div class="step-head"><span class="step-no">${step}</span><h4>${esc(gname)}</h4></div><div class="opt-cards">`;
      for (const k of g.children || []) {
        if (k.available === false) continue;
        const badge = k.label ? `<span class="opt-badge${/duurza/i.test(k.label) ? ' green' : ''}">${esc(k.label)}</span>` : '';
        if (INPUT_TYPES.includes(k.type_code)) {
          // Vrij getal binnen een keuzegroep, bv. "Gewenste oplage"
          const min = k.min_value && Number(k.min_value) > 0 ? k.min_value : 1;
          html += `<form class="opt-card opt-free" data-free="${esc(k.code)}" data-group="${esc(gname)}">
            <div class="oc-body">${badge}<strong>${esc(k.name || pretty(k.code))}</strong>${k.description ? `<small>${esc(k.description)}</small>` : ''}
            <div class="oc-free"><input type="number" name="v" min="${esc(min)}"${k.max_value ? ` max="${esc(k.max_value)}"` : ''} step="${esc(k.step_size || 1)}" required inputmode="numeric" placeholder="Typ je aantal">
            <button type="submit" class="btn">OK</button></div></div></form>`;
          continue;
        }
        const img = k.images && k.images[0] && k.images[0].url;
        const photo = img && /\.(jpe?g|png|webp)(\?|$)/i.test(img);
        html += `<button type="button" class="opt-card${photo ? ' has-photo' : ''}" data-opt="${esc(k.code)}" data-group="${esc(gname)}">
          ${img ? `<span class="oc-img"><img src="${esc(img)}" alt="" loading="lazy"></span>` : ''}
          <span class="oc-body">${badge}<strong>${esc(k.name || pretty(k.code))}</strong>${k.description ? `<small>${esc(k.description)}</small>` : ''}</span>
        </button>`;
      }
      html += '</div></div>';
    }

    if (r.can_order && r.price) {
      const u = (r.uploaders || [])[0];
      html += `<div class="price-box"><div><div class="muted">Prijs voor ${esc(r.amount)} stuk(s)</div><div class="big">${eur(r.price.incl)}</div><div class="muted">${eur(r.price.excl)} excl. btw</div></div></div>
        <div class="opt-group"><span class="opt-title">Drukbestand</span>
          <label class="dropzone" id="dropzone"><input type="file" id="fileInput" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple>
            <strong>Sleep je bestand hierheen</strong> of klik om te kiezen<br><small class="muted">PDF, JPG of PNG, max. ${state.settings.max_upload_mb || 100} MB${u ? ` · ${esc(u.width)} × ${esc(u.height)} cm${u.bleed && u.bleed[0] ? ` + ${esc(u.bleed[0])} cm afloop` : ''}${u.minimal_dpi ? ` · min. ${esc(u.minimal_dpi)} dpi` : ''}` : ''}</small>
          </label>
          <ul class="file-list" id="fileList"></ul>
          <p class="muted" style="font-size:13px">Geen drukklaar bestand? <a class="accent" href="mailto:info@sp-agency.be?subject=Ontwerp%20voor%20webshopbestelling">Wij ontwerpen het voor je</a>.</p>
        </div>
        <button class="btn" type="button" id="addToCart">In winkelmand</button>`;
    } else if (r.can_order && !r.price) {
      html += '<div class="msg err">Voor deze keuze kunnen we online geen prijs berekenen. Vraag een offerte aan.</div>';
    }
    $('#cfgBody').innerHTML = html;
    renderFiles();
  }

  function renderFiles() {
    const ul = $('#fileList');
    if (!ul) return;
    ul.innerHTML = state.files.map((f, i) => `<li><span>${f.uploading ? '<span class="spinner"></span> ' : '✓ '}${esc(f.name)}</span>
      <span>${state.files.length > 1 ? `<select data-side="${i}"><option value="front"${f.side === 'front' ? ' selected' : ''}>Voorkant</option><option value="back"${f.side === 'back' ? ' selected' : ''}>Achterkant</option></select> ` : ''}<button type="button" data-rmfile="${i}">verwijder</button></span></li>`).join('');
  }

  async function uploadFiles(fileList) {
    for (const file of fileList) {
      const maxMb = state.settings.max_upload_mb || 100;
      if (file.size > maxMb * 1024 * 1024) { showError($('#cfgMsg'), `${file.name} is groter dan ${maxMb} MB. Mail het naar info@sp-agency.be.`); continue; }
      const entry = { name: file.name, side: state.files.length ? 'back' : 'front', uploading: true };
      state.files.push(entry);
      renderFiles();
      try {
        const fd = new FormData();
        fd.append('file', file);
        const r = await api('/api/upload', { method: 'POST', body: fd });
        entry.key = r.key;
        entry.uploading = false;
      } catch (e) {
        state.files.splice(state.files.indexOf(entry), 1);
        showError($('#cfgMsg'), e.message);
      }
      renderFiles();
    }
  }

  function addToCart() {
    const r = state.result;
    if (!state.files.length) return showError($('#cfgMsg'), 'Upload eerst je drukbestand.');
    if (state.files.some((f) => f.uploading)) return showError($('#cfgMsg'), 'Even wachten tot je bestand volledig is opgeladen.');
    const summary = (r.selected_options || []).map((o) => (o.value !== undefined && o.value !== null && o.value !== '' ? `${o.name || pretty(o.code)}: ${o.value}` : o.name || pretty(o.code))).join(' · ');
    state.cart.push({
      code: state.product.code, title: state.product.title, options: state.options, summary,
      files: state.files.map((f) => ({ key: f.key, name: f.name, side: f.side })),
      excl: r.price.excl, incl: r.price.incl,
    });
    store.set(state.cart);
    renderCart();
    state.options = []; state.stepNames = []; state.files = [];
    $('#configurator').hidden = true;
    $('#catalogWrap').hidden = false;
    state.product = null;
    renderCatalog();
    $('#cart').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeConfigurator() {
    $('#configurator').hidden = true;
    $('#catalogWrap').hidden = false;
    state.product = null; state.options = []; state.stepNames = []; state.files = [];
    renderCatalog();
    $('#shopTop').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- winkelmand + afrekenen ----------
  function totals() {
    const sub = state.cart.reduce((s, l) => s + l.excl, 0);
    const ship = state.cart.length ? state.settings.shipping_excl : 0;
    const excl = sub + ship;
    const vat = Math.round(excl * state.settings.vat * 100) / 100;
    return { sub, ship, vat, total: excl + vat };
  }

  function renderCart() {
    const t = totals();
    $('#cartLines').innerHTML = state.cart.length
      ? state.cart.map((l, i) => `<li><strong>${esc(l.title)}</strong><span>${eur(l.incl)}</span><small>${esc(l.summary)}</small><button type="button" data-rm="${i}">verwijderen</button></li>`).join('')
      : '<li class="muted" style="border:0">Je winkelmand is nog leeg.</li>';
    $('#cartTotals').innerHTML = state.cart.length ? `
      <div class="cart-row"><span>Subtotaal excl. btw</span><span>${eur(t.sub)}</span></div>
      <div class="cart-row"><span>Verzending excl. btw</span><span>${eur(t.ship)}</span></div>
      <div class="cart-row"><span>Btw 21%</span><span>${eur(t.vat)}</span></div>
      <div class="cart-row total"><span>Totaal</span><span>${eur(t.total)}</span></div>` : '';
    $('#toCheckout').disabled = !state.cart.length;
    document.querySelector('.shop-layout')?.classList.toggle('no-cart', !state.cart.length);
    $('#payTotal').textContent = eur(t.total);
    if (!state.cart.length) $('#checkout').hidden = true;
  }

  async function submitCheckout(ev) {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const g = (k) => (f.get(k) || '').toString().trim();
    const btn = $('#payBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Even geduld…';
    showError($('#checkoutMsg'), '');
    try {
      const r = await postJSON('/api/checkout', {
        items: state.cart.map(({ code, options, files }) => ({ code, options, files })),
        customer: { email: g('email'), phone: g('phone'), vat_number: g('vat_number') },
        address: { company: g('company'), first_name: g('first_name'), last_name: g('last_name'), street: g('street'), house_number: g('house_number'), addition: g('addition'), postal_code: g('postal_code'), city: g('city'), country: g('country') },
        remarks: g('remarks'),
        accept_terms: f.get('accept_terms') === 'on',
      });
      try { sessionStorage.setItem('sp-last-order', r.order_id); } catch { /* */ }
      window.location.href = r.checkout_url;
    } catch (e) {
      showError($('#checkoutMsg'), e.message);
      btn.disabled = false;
      btn.innerHTML = state.settings.payment === 'mollie' ? 'Betalen' : 'Bestelling plaatsen';
    }
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button,[data-cat]');
    if (!t) return;
    if (t.dataset.cat) { state.cat = t.dataset.cat; state.q = ''; const si = $('#shopSearch'); if (si) si.value = ''; state.shown = PAGE; renderCatalog(); $('#shopTop').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (t.id === 'showMore') { state.shown += PAGE * 2; renderCatalog(); }
    else if (t.dataset.code) selectProduct(t.dataset.code);
    else if (t.dataset.opt) { state.options.push({ code: t.dataset.opt }); state.stepNames.push(t.dataset.group || ''); reconfigure(); }
    else if (t.dataset.undo !== undefined) { const n = Number(t.dataset.undo); state.options = state.options.slice(0, n); state.stepNames = state.stepNames.slice(0, n); state.files = []; reconfigure(); }
    else if (t.dataset.rmfile !== undefined) { state.files.splice(Number(t.dataset.rmfile), 1); renderFiles(); }
    else if (t.dataset.rm !== undefined) { state.cart.splice(Number(t.dataset.rm), 1); store.set(state.cart); renderCart(); }
    else if (t.id === 'addToCart') addToCart();
    else if (t.id === 'cfgBack') { closeConfigurator(); }
    else if (t.id === 'toCheckout') { $('#checkout').hidden = false; $('#checkout').scrollIntoView({ behavior: 'smooth' }); }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.dataset && e.target.dataset.free) {
      e.preventDefault();
      const v = new FormData(e.target).get('v');
      state.options.push({ code: e.target.dataset.free, value: String(v) });
      state.stepNames.push(e.target.dataset.group || '');
      reconfigure();
      return;
    }
    if (e.target.id === 'inputForm') {
      e.preventDefault();
      for (const inp of e.target.querySelectorAll('input[name]')) {
        state.options.push({ code: inp.name, value: String(inp.value) });
        state.stepNames.push(inp.dataset.group || '');
      }
      reconfigure();
    } else if (e.target.id === 'checkoutForm') submitCheckout(e);
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'shopSearch') { state.q = e.target.value.trim(); state.shown = PAGE; renderCatalog(); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'fileInput') uploadFiles([...e.target.files]);
    if (e.target.dataset.side !== undefined) state.files[Number(e.target.dataset.side)].side = e.target.value;
  });
  document.addEventListener('dragover', (e) => { const z = e.target.closest('#dropzone'); if (z) { e.preventDefault(); z.classList.add('drag'); } });
  document.addEventListener('dragleave', (e) => { const z = e.target.closest('#dropzone'); if (z) z.classList.remove('drag'); });
  document.addEventListener('drop', (e) => { const z = e.target.closest('#dropzone'); if (z) { e.preventDefault(); z.classList.remove('drag'); uploadFiles([...e.dataTransfer.files]); } });

  // ---------- start ----------
  async function init() {
    renderCart();
    if (!API) {
      $('#shopNotice').hidden = false;
      return;
    }
    try {
      const r = await api('/api/products');
      state.products = r.products || [];
      state.categories = r.categories || [];
      if (r.settings) state.settings = r.settings;
      if (state.settings.payment === 'transfer') {
        $('#payInfo').textContent = 'Betalen via overschrijving. Je krijgt de betaalgegevens na je bestelling.';
        $('#payInfo2').textContent = 'Na je bestelling krijg je de betaalgegevens. Zodra je betaling binnen is, gaat je bestelling in productie.';
        $('#payBtn').textContent = 'Bestelling plaatsen';
      } else if (state.settings.payment === 'test') {
        $('#payInfo').textContent = 'TESTMODUS: er wordt niet betaald en niets gedrukt.';
        $('#payBtn').textContent = 'Testbestelling plaatsen';
      }
      renderCatalog();
      renderCart();
    } catch (e) {
      showError($('#productGrid'), 'De webshop is even niet bereikbaar. Probeer het later opnieuw of mail naar info@sp-agency.be.');
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
