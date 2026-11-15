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

  const state = { products: [], settings: { shipping_excl: 9.95, vat: 0.21 }, cat: 'Alles', product: null, options: [], result: null, files: [], cart: store.get() };

  async function api(path, opts) {
    const res = await fetch(API + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Er ging iets mis. Probeer het opnieuw.');
    return data;
  }
  const postJSON = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  function showError(el, msg) { el.innerHTML = msg ? `<div class="msg err">${esc(msg)}</div>` : ''; }

  // ---------- catalogus ----------
  function renderCatalog() {
    const cats = ['Alles', ...new Set(state.products.map((p) => p.category))];
    $('#catFilters').innerHTML = cats.map((c) => `<button type="button" class="${c === state.cat ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
    const list = state.products.filter((p) => state.cat === 'Alles' || p.category === state.cat);
    $('#productGrid').innerHTML = list.map((p) => `
      <button type="button" class="product-card ${state.product?.code === p.code ? 'active' : ''}" data-code="${esc(p.code)}">
        <img src="${esc(p.image)}" alt="" loading="lazy">
        <div class="pc-body"><div class="pc-cat">${esc(p.category)}</div><h3>${esc(p.title)}</h3><p class="muted">${esc(p.description)}</p></div>
      </button>`).join('');
  }

  // ---------- configurator ----------
  async function selectProduct(code) {
    state.product = state.products.find((p) => p.code === code);
    state.options = [];
    state.files = [];
    renderCatalog();
    const box = $('#configurator');
    box.hidden = false;
    $('#cfgTitle').textContent = state.product.title;
    $('#cfgDesc').textContent = state.product.description;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    const label = (o) => {
      const s = sel.find((x) => x.code === o.code);
      const name = (s && s.name) || pretty(o.code);
      return o.value !== undefined ? `${name}: ${o.value}` : name;
    };
    let html = '';
    if (state.options.length) {
      html += `<div class="chosen">${state.options.map((o, i) => `<span>${esc(label(o))} <button type="button" data-undo="${i}" title="Vanaf hier wijzigen">wijzig</button></span>`).join('')}</div>`;
    }

    const inputGroups = [], choiceGroups = [];
    for (const g of r.available_options || []) {
      const kids = g.children || [];
      if (kids.length && kids.every((k) => INPUT_TYPES.includes(k.type_code))) inputGroups.push(g);
      else choiceGroups.push(g);
    }
    if (inputGroups.length) {
      html += '<form class="opt-group" id="inputForm"><div class="opt-inputs">';
      for (const g of inputGroups) {
        for (const k of g.children) {
          const unit = ['width', 'height', 'length'].includes(k.type_code) ? ' (cm)' : '';
          const min = k.min_value && Number(k.min_value) > 0 ? ` min="${esc(k.min_value)}"` : ' min="1"';
          const max = k.max_value ? ` max="${esc(k.max_value)}"` : '';
          html += `<label class="field">${esc(k.name || pretty(k.code))}${unit}<input type="number" step="any" required name="${esc(k.code)}"${min}${max}></label>`;
        }
      }
      html += '<button class="btn" type="submit">Verder</button></div></form>';
    }
    for (const g of choiceGroups) {
      html += `<div class="opt-group"><span class="opt-title">${esc(g.name || pretty(g.code))}</span><div class="opt-choices">`;
      for (const k of g.children || []) {
        if (k.available === false) continue;
        if (INPUT_TYPES.includes(k.type_code)) {
          // Vrij getal binnen een keuzegroep, bv. "Gewenste oplage"
          const min = k.min_value && Number(k.min_value) > 0 ? k.min_value : 1;
          html += `<form class="opt-choice opt-free" data-free="${esc(k.code)}"><span>${esc(k.name || pretty(k.code))}</span>
            <input type="number" name="v" min="${esc(min)}"${k.max_value ? ` max="${esc(k.max_value)}"` : ''} step="${esc(k.step_size || 'any')}" required placeholder="${esc(k.description || '')}" style="width:110px;min-height:34px;border-radius:8px;border:1px solid var(--s-line);background:var(--s-input);color:var(--s-text);padding:4px 8px">
            <button type="submit" class="btn" style="min-height:34px;padding:6px 12px">OK</button></form>`;
          continue;
        }
        const img = k.images && k.images[0] && k.images[0].url;
        html += `<button type="button" class="opt-choice" data-opt="${esc(k.code)}" title="${esc(k.description || '')}">${img ? `<img src="${esc(img)}" alt="">` : ''}${esc(k.name || pretty(k.code))}${k.description && !img ? `<small class="muted" style="font-weight:500">&nbsp;${esc(k.description)}</small>` : ''}</button>`;
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
    state.options = []; state.files = [];
    $('#configurator').hidden = true;
    state.product = null;
    renderCatalog();
    $('#cart').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    if (t.dataset.cat) { state.cat = t.dataset.cat; renderCatalog(); }
    else if (t.dataset.code) selectProduct(t.dataset.code);
    else if (t.dataset.opt) { state.options.push({ code: t.dataset.opt }); reconfigure(); }
    else if (t.dataset.undo !== undefined) { state.options = state.options.slice(0, Number(t.dataset.undo)); state.files = []; reconfigure(); }
    else if (t.dataset.rmfile !== undefined) { state.files.splice(Number(t.dataset.rmfile), 1); renderFiles(); }
    else if (t.dataset.rm !== undefined) { state.cart.splice(Number(t.dataset.rm), 1); store.set(state.cart); renderCart(); }
    else if (t.id === 'addToCart') addToCart();
    else if (t.id === 'toCheckout') { $('#checkout').hidden = false; $('#checkout').scrollIntoView({ behavior: 'smooth' }); }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.dataset && e.target.dataset.free) {
      e.preventDefault();
      const v = new FormData(e.target).get('v');
      state.options.push({ code: e.target.dataset.free, value: String(v) });
      reconfigure();
      return;
    }
    if (e.target.id === 'inputForm') {
      e.preventDefault();
      for (const [k, v] of new FormData(e.target)) {
        state.options = state.options.filter((o) => o.code !== k);
        state.options.push({ code: k, value: String(v) });
      }
      reconfigure();
    } else if (e.target.id === 'checkoutForm') submitCheckout(e);
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
