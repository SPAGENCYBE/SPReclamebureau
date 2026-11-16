/* SP Reclamebureau webshop — praat met de shop-api (Cloudflare Worker) */
(() => {
  const BASE = (document.currentScript && document.currentScript.src) || location.href;
  const API = (document.querySelector('meta[name="sp-shop-api"]')?.content || '').replace(/\/$/, '');
  const $ = (s, el = document) => el.querySelector(s);
  const eur = (n) => '€ ' + Number(n || 0).toFixed(2).replace('.', ',');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nl = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('nl-BE'));
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
  const state = { products: [], categories: [], stepNames: [], settings: { shipping_excl: 9.95, vat: 0.21 }, cat: 'Alles', q: '', shown: PAGE, product: null, options: [], result: null, slots: { front: null, back: null }, ack: false, cart: store.get() };

  const authToken = () => { try { return localStorage.getItem('sp-auth') || ''; } catch { return ''; } };
  async function api(path, opts = {}) {
    const tok = authToken();
    const headers = { ...(opts.headers || {}), ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
    const res = await fetch(API + path, { ...opts, headers });
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
    resetSlots();
    state.uploader = null;
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
    if (state.uploader && state.uploader.options !== JSON.stringify(state.options)) state.uploader = null;
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
      html += `<div class="price-box"><div><div class="muted">Prijs voor ${esc(r.amount)} stuk(s)</div><div class="big">${eur(r.price.incl)}</div><div class="muted">${eur(r.price.excl)} excl. btw</div></div></div>
        <div class="opt-group"><span class="opt-title">Drukbestand</span>
          <div id="checkBox">${checkHtml()}</div>
          <p class="muted" style="font-size:13px">Geen drukklaar bestand? <a class="accent" href="mailto:info@sp-agency.be?subject=Ontwerp%20voor%20webshopbestelling">Wij ontwerpen het voor je</a>.</p>
        </div>
        <button class="btn" type="button" id="addToCart">In winkelmand</button>`;
    } else if (r.can_order && !r.price) {
      html += '<div class="msg err">Voor deze keuze kunnen we online geen prijs berekenen. Vraag een offerte aan.</div>';
    }
    $('#cfgBody').innerHTML = html;
  }

  // ---------- Probo-uploader (bestandscontrole zoals bij Probo) ----------
  function uploaderHtml(u) {
    const up = state.uploader;
    const fmt = u ? `${nl(u.width)} × ${nl(u.height)} cm${u.type === 'double' ? ', voor- en achterkant' : ''}` : '';
    if (up && up.approved) {
      return `<div class="up-ok">✓ <strong>Bestanden goedgekeurd</strong><span class="muted">Je ontwerp is gecontroleerd en klaar voor productie.</span></div>
        <button type="button" class="btn outline" data-uploader="open">Bestanden aanpassen</button>`;
    }
    if (up && up.id) {
      return `<div class="up-wait"><span class="spinner"></span> <strong>Wachten op je bestanden…</strong><span class="muted">Upload je ontwerp in het venster dat opende en klik daar op <b>Afronden</b>.</span></div>
        <button type="button" class="btn outline" data-uploader="open">Uploadvenster opnieuw openen</button>`;
    }
    return `<p class="up-intro">Upload je ontwerp en controleer meteen hoe het gedrukt wordt${fmt ? ` (formaat <b>${fmt}</b>)` : ''}. Zo kan er niets fout gaan.</p>
      <button type="button" class="btn" data-uploader="new">Bestanden uploaden en controleren</button>`;
  }

  function refreshUploaderBox() { renderCheck(); }

  async function startUploader(win) {
    try {
      const r = await postJSON('/api/uploader', { code: state.product.code, options: state.options });
      state.uploader = { id: r.id, token: r.token, url: r.url, approved: false, options: JSON.stringify(state.options) };
      if (win && !win.closed) win.location.href = r.url; else window.open(r.url, '_blank');
      refreshUploaderBox();
      pollUploader();
    } catch (e) {
      if (win && !win.closed) win.close();
      showError($('#cfgMsg'), e.message);
    }
  }

  let pollTimer = null;
  async function pollUploader() {
    clearTimeout(pollTimer);
    const up = state.uploader;
    if (!up || up.approved) return;
    try {
      const r = await api(`/api/uploader/${encodeURIComponent(up.id)}?t=${encodeURIComponent(up.token)}`);
      if (state.uploader !== up) return;
      if (r.approved) { up.approved = true; refreshUploaderBox(); return; }
      if (r.status === 'rejected') { state.uploader = null; refreshUploaderBox(); showError($('#cfgMsg'), r.message || 'Je bestanden zijn afgekeurd. Probeer opnieuw.'); return; }
    } catch { /* opnieuw proberen */ }
    pollTimer = setTimeout(pollUploader, 3000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.uploader && !state.uploader.approved) pollUploader(); });

  // ---------- Controlescherm in SP-stijl (voorbeeld, snijlijn, afloop, formaat en resolutie) ----------
  const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
  const fmtCm = (w, h) => `${nl(Math.round(w * 10) / 10)} × ${nl(Math.round(h * 10) / 10)} cm`;
  let pdfjsP = null;
  function pdfjs() {
    if (!pdfjsP) {
      pdfjsP = import(new URL('vendor/pdfjs/pdf.min.mjs', BASE).href).then((m) => {
        m.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.min.mjs', BASE).href;
        return m;
      });
      pdfjsP.catch(() => { pdfjsP = null; });
    }
    return pdfjsP;
  }

  function resetSlots() { state.slots = { front: null, back: null }; state.ack = false; }
  const curUploader = () => ((state.result && state.result.uploaders) || [])[0] || null;
  const isDouble = () => (curUploader() || {}).type === 'double';

  function geometry(u) {
    const b = (u.bleed || []).map((x) => Number(x) || 0);
    const [bt, br, bb, bl] = [b[0] || 0, b[1] || 0, b[2] || 0, b[3] || 0];
    const T = [Number(u.width), Number(u.height)];
    const B = [T[0] + bl + br, T[1] + bt + bb];
    const safe = Math.max(T[0], T[1]) <= 60 ? 0.3 : Math.min(3, Math.min(T[0], T[1]) * 0.05);
    return { T, B, bt, br, bb, bl, safe };
  }

  /** Leest een bestand in de browser: PDF via pdf.js, afbeeldingen via canvas. */
  async function analyze(file) {
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    const isImg = /\.(jpe?g|png)$/i.test(file.name) || /^image\/(jpeg|png)$/.test(file.type);
    if (!isPdf && !isImg) return { kind: 'bad' };
    if (isImg) {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * scale)); c.height = Math.max(1, Math.round(bmp.height * scale));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const info = { kind: 'img', pages: 1, px: [bmp.width, bmp.height], sizes: [null], previews: [c.toDataURL('image/jpeg', 0.85)] };
      bmp.close && bmp.close();
      return info;
    }
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const info = { kind: 'pdf', pages: doc.numPages, sizes: [], previews: [] };
    for (let i = 1; i <= Math.min(2, doc.numPages); i++) {
      const page = await doc.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      info.sizes.push([vp1.width / 72 * 2.54, vp1.height / 72 * 2.54]);
      const vp = page.getViewport({ scale: Math.min(4, 900 / Math.max(vp1.width, vp1.height)) });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      info.previews.push(c.toDataURL('image/jpeg', 0.85));
    }
    doc.destroy();
    return info;
  }

  /** Vergelijkt een bestand met het gevraagde formaat. Geeft {fit, msgs:[{lvl,text}]}. */
  function evaluate(slot, u) {
    const g = geometry(u);
    const msgs = [];
    const info = slot.info;
    if (slot.error) return { fit: 'none', msgs: [{ lvl: 'err', text: slot.error }] };
    if (!info) return { fit: 'none', msgs: [] };
    if (info.kind === 'bad') return { fit: 'none', msgs: [{ lvl: 'err', text: 'Dit bestandstype kunnen we niet drukken. Gebruik PDF, JPG of PNG.' }] };
    if (info.kind === 'unknown') return { fit: 'bleed', msgs: [{ lvl: 'warn', text: 'We konden geen voorbeeld maken van dit bestand. Controleer zelf of formaat en afloop kloppen.' }] };

    const near = (a, x) => Math.abs(a - x) <= Math.max(0.15, x * 0.01);
    const ratioNear = (r, x) => Math.abs(r - x) / x <= 0.02;
    const rB = g.B[0] / g.B[1], rT = g.T[0] / g.T[1];
    const size = info.sizes[slot.page || 0];
    const hasBleed = g.B[0] - g.T[0] > 0.01 || g.B[1] - g.T[1] > 0.01;
    let fit;
    if (size) {
      const [w, h] = size;
      if (near(w, g.B[0]) && near(h, g.B[1])) fit = 'bleed';
      else if (hasBleed && near(w, g.T[0]) && near(h, g.T[1])) fit = 'trim';
      else if (ratioNear(w / h, rB)) fit = 'scale-bleed';
      else if (hasBleed && ratioNear(w / h, rT)) fit = 'scale-trim';
      else if (Math.abs(rB - 1) > 0.03 && (ratioNear(h / w, rB) || ratioNear(h / w, rT))) fit = 'rotated';
      else fit = 'ratio';
      const sizeTxt = `Je bestand is ${fmtCm(w, h)}`;
      if (fit === 'bleed') msgs.push({ lvl: 'ok', text: hasBleed ? `Formaat klopt: ${fmtCm(w, h)}, inclusief afloop.` : `Formaat klopt: ${fmtCm(w, h)}.` });
      else if (fit === 'trim') msgs.push({ lvl: 'warn', text: `${sizeTxt}: dat is de snijmaat zonder afloop. Bij het snijden kan er een wit randje ontstaan. Laat je achtergrond liefst doorlopen tot ${fmtCm(g.B[0], g.B[1])}.` });
      else if (fit === 'scale-bleed' || fit === 'scale-trim') msgs.push({ lvl: 'warn', text: `${sizeTxt}. De verhouding klopt, maar het formaat niet: we schalen het naar ${fmtCm(...(fit === 'scale-bleed' ? g.B : g.T))}. Controleer of kleine tekst leesbaar blijft.` });
      else if (fit === 'rotated') msgs.push({ lvl: 'warn', text: `${sizeTxt}: je ontwerp staat ${w > h ? 'liggend' : 'staand'}, het product ${g.T[0] > g.T[1] ? 'liggend' : 'staand'}. Kies de andere oriëntatie of draai je ontwerp.` });
      else msgs.push({ lvl: 'warn', text: `${sizeTxt}, maar we hebben ${fmtCm(g.B[0], g.B[1])} nodig${hasBleed ? ' (incl. afloop)' : ''}. De verhouding is anders, dus je ontwerp past niet goed: er valt iets weg of er komt witruimte bij.` });
    } else {
      // Afbeelding: geen fysieke maat, dus enkel verhouding + resolutie.
      const [pw, ph] = info.px;
      const r = pw / ph;
      if (ratioNear(r, rB)) fit = 'bleed';
      else if (hasBleed && ratioNear(r, rT)) fit = 'trim';
      else if (Math.abs(rB - 1) > 0.03 && (ratioNear(1 / r, rB) || ratioNear(1 / r, rT))) fit = 'rotated';
      else fit = 'ratio';
      const target = fit === 'trim' ? g.T : g.B;
      const dpi = Math.round(pw / (target[0] / 2.54));
      slot.dpi = dpi;
      if (fit === 'bleed') msgs.push({ lvl: 'ok', text: hasBleed ? 'Verhouding klopt, inclusief afloop.' : 'Verhouding klopt.' });
      else if (fit === 'trim') msgs.push({ lvl: 'warn', text: `Je afbeelding heeft de verhouding van de snijmaat, zonder afloop. Bij het snijden kan er een wit randje ontstaan. Laat je achtergrond liefst doorlopen tot ${fmtCm(g.B[0], g.B[1])}.` });
      else if (fit === 'rotated') msgs.push({ lvl: 'warn', text: `Je afbeelding staat ${pw > ph ? 'liggend' : 'staand'}, het product ${g.T[0] > g.T[1] ? 'liggend' : 'staand'}. Kies de andere oriëntatie of draai je ontwerp.` });
      else msgs.push({ lvl: 'warn', text: `De verhouding van je afbeelding (${nl(pw)} × ${nl(ph)} px) past niet bij ${fmtCm(g.B[0], g.B[1])}. Er valt iets weg of er komt witruimte bij.` });
      const minDpi = Math.max(Number(u.minimal_dpi) || 72, 72);
      const small = Math.max(g.T[0], g.T[1]) <= 45;
      if (dpi < minDpi) msgs.push({ lvl: 'warn', text: `Resolutie te laag: ${dpi} dpi op dit formaat (minimum ${minDpi} dpi). Je druk wordt korrelig of wazig.` });
      else if (small && dpi < 200) msgs.push({ lvl: 'warn', text: `Resolutie ${dpi} dpi: bruikbaar, maar voor drukwerk raden we 300 dpi aan voor scherpe tekst en foto's.` });
      else msgs.push({ lvl: 'ok', text: `Resolutie ${dpi} dpi: scherp genoeg.` });
    }
    if (info.kind === 'pdf') {
      const need = isDouble() && slot.both ? 2 : 1;
      if (info.pages > 2 || (!isDouble() && info.pages > 1)) {
        msgs.unshift({ lvl: 'err', text: `Je PDF heeft ${info.pages} pagina's. Voor dit product ${isDouble() ? 'mag hij maximaal 2 pagina\'s hebben (voor- en achterkant)' : 'is 1 pagina nodig. Kies dubbelzijdig of upload een PDF met 1 pagina'}.` });
      } else if (need === 2 && info.sizes[1] && info.sizes[0] && (Math.abs(info.sizes[0][0] - info.sizes[1][0]) > 0.15 || Math.abs(info.sizes[0][1] - info.sizes[1][1]) > 0.15)) {
        msgs.push({ lvl: 'warn', text: 'Pagina 1 en 2 hebben een ander formaat.' });
      }
    }
    return { fit, msgs };
  }

  function previewHtml(slot, u, fit) {
    const g = geometry(u);
    const pct = (v, tot) => `${(v / tot * 100).toFixed(3)}%`;
    const trimStyle = `left:${pct(g.bl, g.B[0])};top:${pct(g.bt, g.B[1])};right:${pct(g.br, g.B[0])};bottom:${pct(g.bb, g.B[1])}`;
    const safeStyle = `inset:${pct(g.safe, g.T[1])} ${pct(g.safe, g.T[0])}`;
    const src = slot.info && slot.info.previews ? slot.info.previews[slot.page || 0] : null;
    let img = '';
    if (src) {
      const cls = fit === 'trim' || fit === 'scale-trim' ? 'pv-img at-trim' : fit === 'bleed' || fit === 'scale-bleed' ? 'pv-img fill' : 'pv-img contain';
      const atTrim = `left:${pct(g.bl, g.B[0])};top:${pct(g.bt, g.B[1])};width:${pct(g.T[0], g.B[0])};height:${pct(g.T[1], g.B[1])}`;
      img = `<img class="${cls}" src="${src}" alt="" style="${cls.includes('at-trim') ? atTrim : ''}">`;
    }
    const ratio = g.B[0] / g.B[1];
    const w = Math.round(Math.min(340, 300 * ratio));
    return `<div class="pv-frame" style="aspect-ratio:${g.B[0]}/${g.B[1]};width:min(100%,${w}px)">
      ${img}${!src && !slot.error ? '<div class="pv-busy"><span class="spinner"></span> Bestand lezen…</div>' : ''}
      <div class="pv-trim" style="${trimStyle}"><div class="pv-safe" style="${safeStyle}"></div></div>
    </div>`;
  }

  function slotHtml(side, label, u) {
    const slot = state.slots[side];
    if (!slot) {
      return `<div class="chk-slot"><div class="chk-slot-h">${label}</div>
        <label class="chk-drop" data-drop="${side}"><input type="file" data-slotinput="${side}" accept="${ACCEPT}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>
          <strong>Sleep je bestand hierheen</strong><small>of klik om te kiezen · PDF, JPG of PNG</small></label>
        ${side === 'back' && state.slots.front && !state.slots.front.both ? '<button type="button" class="linkbtn" data-same>Zelfde ontwerp als voorkant gebruiken</button>' : ''}
      </div>`;
    }
    const ev = evaluate(slot, u);
    const pageTxt = slot.info && slot.info.kind === 'pdf' && slot.info.pages > 1 ? ` · pagina ${(slot.page || 0) + 1}` : '';
    const status = slot.uploading ? '<span class="spinner"></span> opladen…' : slot.key ? '✓ opgeladen' : '';
    return `<div class="chk-slot"><div class="chk-slot-h">${label}</div>
      ${previewHtml(slot, u, ev.fit)}
      <div class="chk-file"><span title="${esc(slot.name)}">${esc(slot.name)}${pageTxt}</span><span class="muted">${status}</span>
        <button type="button" class="linkbtn" data-slotrm="${side}">Vervangen</button></div>
      <ul class="chk-list">${ev.msgs.map((m) => `<li class="${m.lvl}">${esc(m.text)}</li>`).join('')}</ul>
    </div>`;
  }

  function checkHtml() {
    const u = curUploader();
    if (!u) return '<p class="muted">Kies eerst alle opties hierboven.</p>';
    if (state.uploader) return `<div class="uploader-box">${uploaderHtml(u)}</div><button type="button" class="linkbtn" data-uploader="cancel">Terug naar het SP-controlescherm</button>`;
    const g = geometry(u);
    const dbl = u.type === 'double';
    const hasBleed = g.B[0] - g.T[0] > 0.01;
    const all = ['front', ...(dbl ? ['back'] : [])].map((s) => state.slots[s]).filter(Boolean);
    const anyWarn = all.some((s) => evaluate(s, u).msgs.some((m) => m.lvl === 'warn'));
    return `<div class="chk">
      <div class="chk-spec"><span>Snijmaat <b>${fmtCm(g.T[0], g.T[1])}</b></span>${hasBleed ? `<span>Met afloop <b>${fmtCm(g.B[0], g.B[1])}</b></span>` : ''}<span><b>${dbl ? 'Dubbelzijdig' : 'Enkelzijdig'}</b></span></div>
      ${dbl ? '<p class="chk-tip">Tip: één PDF met 2 pagina\'s verdelen we automatisch over voor- en achterkant.</p>' : ''}
      <div class="chk-slots${dbl ? ' two' : ''}">${slotHtml('front', dbl ? 'Voorkant' : 'Je ontwerp', u)}${dbl ? slotHtml('back', 'Achterkant', u) : ''}</div>
      ${dbl && (state.slots.front || state.slots.back) ? '<button type="button" class="btn outline small" data-swap>⇄ Voor- en achterkant omwisselen</button>' : ''}
      ${all.length ? `<div class="chk-legend"><span><i class="lg-trim"></i>Snijlijn</span>${hasBleed ? '<span><i class="lg-bleed"></i>Afloop, wordt weggesneden</span>' : ''}<span><i class="lg-safe"></i>Houd tekst binnen deze lijn</span></div>` : ''}
      ${anyWarn ? `<label class="chk-ack"><input type="checkbox" id="chkAck" ${state.ack ? 'checked' : ''}> Ik heb het voorbeeld bekeken en wil dit bestand toch zo laten drukken.</label>` : ''}
      <p class="chk-foot">Voor productie controleren we je bestand nog eens. Liever de uitgebreide controle van onze drukker (met vullen en spiegelen)? <button type="button" class="linkbtn" data-uploader="new">Open dat uploadvenster</button>.</p>
    </div>`;
  }

  function renderCheck() {
    const box = $('#checkBox');
    if (box) box.innerHTML = checkHtml();
  }

  async function addFile(side, file) {
    showError($('#cfgMsg'), '');
    const maxMb = state.settings.max_upload_mb || 100;
    if (file.size > maxMb * 1024 * 1024) return showError($('#cfgMsg'), `${file.name} is groter dan ${maxMb} MB. Mail het naar info@sp-agency.be.`);
    const slot = { name: file.name, uploading: true, page: 0, info: null };
    state.slots[side] = slot;
    state.ack = false;
    renderCheck();
    const up = (async () => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api('/api/upload', { method: 'POST', body: fd });
      slot.key = r.key;
    })().catch((e) => { slot.error = e.message || 'Opladen mislukt. Probeer opnieuw.'; }).finally(() => { slot.uploading = false; renderCheck(); });
    try {
      slot.info = await analyze(file);
    } catch {
      slot.info = { kind: 'unknown', pages: 1, sizes: [null], previews: [] };
    }
    // Dubbelzijdig + PDF met 2 pagina's: automatisch verdelen over voor- en achterkant.
    if (isDouble() && slot.info.kind === 'pdf' && slot.info.pages === 2 && state.slots[side] === slot) {
      const front = { ...slot, page: 0, both: true };
      const back = { ...slot, page: 1, both: true };
      // Beide verwijzen naar hetzelfde opgeladen bestand: key overnemen zodra het klaar is.
      state.slots.front = front; state.slots.back = back;
      up.then(() => { front.key = back.key = slot.key; front.error = back.error = slot.error; front.uploading = back.uploading = false; renderCheck(); });
      front.uploading = back.uploading = slot.uploading;
    } else if (state.slots.front && state.slots.front.both && side === 'back') {
      state.slots.front = { ...state.slots.front, both: false, page: 0 };
    } else if (state.slots.back && state.slots.back.both && side === 'front') {
      state.slots.back = null;
    }
    renderCheck();
  }

  function clearSlot(side) {
    const s = state.slots[side];
    if (s && s.both) { state.slots.front = null; state.slots.back = null; } else state.slots[side] = null;
    state.ack = false;
    renderCheck();
    const inp = document.querySelector(`[data-slotinput="${side}"]`);
    if (inp) inp.click();
  }

  function swapSlots() {
    const { front, back } = state.slots;
    state.slots = { front: back, back: front };
    renderCheck();
  }

  function addToCart() {
    const r = state.result;
    const u = curUploader();
    const viaUploader = state.uploader && state.uploader.approved;
    if (state.uploader && !state.uploader.approved) return showError($('#cfgMsg'), 'Rond eerst het uploaden af: klik in het uploadvenster op "Afronden", of ga terug naar het SP-controlescherm.');
    let files = [];
    if (!viaUploader) {
      const dbl = u && u.type === 'double';
      const { front, back } = state.slots;
      if (!front) return showError($('#cfgMsg'), dbl ? 'Upload eerst de voorkant van je ontwerp.' : 'Upload eerst je drukbestand.');
      if (dbl && !back) return showError($('#cfgMsg'), 'Dit product wordt aan twee kanten bedrukt. Upload ook de achterkant (of kies "Zelfde ontwerp als voorkant").');
      const used = dbl ? [front, back] : [front];
      if (used.some((s) => s.uploading)) return showError($('#cfgMsg'), 'Even wachten tot je bestand volledig is opgeladen.');
      const evs = used.map((s) => evaluate(s, u));
      if (used.some((s) => !s.key) || evs.some((e) => e.msgs.some((m) => m.lvl === 'err'))) return showError($('#cfgMsg'), 'Er is een probleem met je bestand. Bekijk de melding bij het voorbeeld.');
      if (evs.some((e) => e.msgs.some((m) => m.lvl === 'warn')) && !state.ack) return showError($('#cfgMsg'), 'Bekijk de opmerkingen bij je bestand en vink aan dat je het zo wil laten drukken.');
      if (dbl && front.both && back.both) files = [{ key: front.key, name: front.name, side: 'front', ...(front.page === 1 ? { swap: true } : {}) }];
      else files = used.map((s, i) => ({ key: s.key, name: s.name, side: i ? 'back' : 'front' }));
    }
    const summary = (r.selected_options || []).map((o) => (o.value !== undefined && o.value !== null && o.value !== '' ? `${o.name || pretty(o.code)}: ${o.value}` : o.name || pretty(o.code))).join(' · ');
    state.cart.push({
      code: state.product.code, title: state.product.title, options: state.options, steps: state.stepNames, summary,
      files,
      uploader: viaUploader ? { id: state.uploader.id, token: state.uploader.token } : null,
      excl: r.price.excl, incl: r.price.incl,
    });
    store.set(state.cart);
    renderCart();
    state.options = []; state.stepNames = []; resetSlots(); state.uploader = null;
    $('#configurator').hidden = true;
    $('#catalogWrap').hidden = false;
    state.product = null;
    renderCatalog();
    $('#cart').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closeConfigurator() {
    $('#configurator').hidden = true;
    $('#catalogWrap').hidden = false;
    state.product = null; state.options = []; state.stepNames = []; resetSlots(); state.uploader = null;
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
        items: state.cart.map(({ code, options, steps, files, uploader }) => ({ code, options, steps, files, uploader })),
        save_details: f.get('save_details') === 'on',
        customer: { email: g('email'), phone: g('phone'), vat_number: g('vat_number') },
        address: { company: g('company'), first_name: g('first_name'), last_name: g('last_name'), street: g('street'), house_number: g('house_number'), addition: g('addition'), postal_code: g('postal_code'), city: g('city'), country: g('country') },
        remarks: g('remarks'),
        accept_terms: f.get('accept_terms') === 'on',
        return_url: new URL('bedankt.html', location.href).href,
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
    else if (t.dataset.undo !== undefined) { const n = Number(t.dataset.undo); state.options = state.options.slice(0, n); state.stepNames = state.stepNames.slice(0, n); reconfigure(); }
    else if (t.dataset.slotrm) { clearSlot(t.dataset.slotrm); }
    else if (t.dataset.swap !== undefined) { swapSlots(); }
    else if (t.dataset.same !== undefined) { state.slots.back = { ...state.slots.front }; state.ack = false; renderCheck(); }
    else if (t.dataset.uploader === 'cancel') { state.uploader = null; renderCheck(); }
    else if (t.dataset.rm !== undefined) { state.cart.splice(Number(t.dataset.rm), 1); store.set(state.cart); renderCart(); }
    else if (t.dataset.uploader === 'new') { const w = window.open('', '_blank'); if (w) w.document.write('<p style="font-family:sans-serif;padding:24px">Uploadvenster wordt geopend…</p>'); startUploader(w); }
    else if (t.dataset.uploader === 'open' && state.uploader) { window.open(state.uploader.url, '_blank'); if (!state.uploader.approved) pollUploader(); else { state.uploader.approved = false; refreshUploaderBox(); pollUploader(); } }
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
    if (e.target.dataset.slotinput && e.target.files[0]) addFile(e.target.dataset.slotinput, e.target.files[0]);
    if (e.target.id === 'chkAck') { state.ack = e.target.checked; }
  });
  document.addEventListener('dragover', (e) => { const z = e.target.closest('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('drag'); } });
  document.addEventListener('dragleave', (e) => { const z = e.target.closest('[data-drop]'); if (z) z.classList.remove('drag'); });
  document.addEventListener('drop', (e) => { const z = e.target.closest('[data-drop]'); if (z) { e.preventDefault(); z.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) addFile(z.dataset.drop, f); } });

  // ---------- account: gegevens invullen + opnieuw bestellen ----------
  async function setupAccount() {
    const box = $('#checkoutAccount');
    if (!box) return;
    if (!authToken()) {
      box.innerHTML = 'Heb je een account? <a class="accent" href="account.html?next=webshop">Log in</a> en je gegevens worden ingevuld. Nog geen account? <a class="accent" href="account.html?next=webshop">Maak er een aan</a>.';
      return;
    }
    try {
      const { user } = await api('/api/account');
      state.account = user;
      const form = $('#checkoutForm');
      const set = (n, v) => { const el = form.elements[n]; if (el && !el.value && v) el.value = v; };
      set('email', user.email); set('phone', user.profile.phone); set('vat_number', user.profile.vat_number);
      const fill = (a) => { for (const k of ['company', 'first_name', 'last_name', 'street', 'house_number', 'addition', 'postal_code', 'city']) { const el = form.elements[k]; if (el) el.value = a[k] || user.profile[k] || ''; } if (form.elements.country) form.elements.country.value = a.country || 'BE'; };
      const addrs = user.addresses || [];
      box.innerHTML = `Ingelogd als <strong>${esc(user.email)}</strong>.` + (addrs.length > 1 ? ` <label>Leveradres: <select id="addrPick">${addrs.map((a, i) => `<option value="${i}">${esc(a.label || a.street + ' ' + a.house_number)}</option>`).join('')}</select></label>` : '')
        + ' <label><input type="checkbox" name="save_details" form="checkoutForm" checked> Gegevens bewaren in mijn account</label>';
      fill(addrs[0] || user.profile);
      $('#addrPick')?.addEventListener('change', (ev) => fill(addrs[Number(ev.target.value)]));
    } catch {
      box.innerHTML = '<a class="accent" href="account.html?next=webshop">Log opnieuw in</a> om je gegevens in te vullen.';
    }
  }

  async function reorderFromUrl() {
    const m = /^([^:]+):(\d+)$/.exec(new URLSearchParams(location.search).get('reorder') || '');
    if (!m || !authToken()) return;
    try {
      const { orders } = await api('/api/account/orders');
      const line = (orders.find((o) => o.id === m[1]) || { lines: [] }).lines[Number(m[2])];
      if (!line || !state.products.find((p) => p.code === line.code)) return;
      await selectProduct(line.code);
      state.options = line.options.map((o) => ({ ...o }));
      state.stepNames = line.steps && line.steps.length === line.options.length ? [...line.steps] : line.options.map(() => '');
      await reconfigure();
      showError($('#cfgMsg'), '');
      $('#cfgMsg').innerHTML = '<div class="msg ok">Je vorige samenstelling staat klaar. Pas aan wat je wil en upload je ontwerp.</div>';
    } catch { /* stil */ }
  }

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
      setupAccount();
      reorderFromUrl();
      if (location.hash === '#checkout' && state.cart.length) { $('#checkout').hidden = false; $('#checkout').scrollIntoView(); }
    } catch (e) {
      showError($('#productGrid'), 'De webshop is even niet bereikbaar. Probeer het later opnieuw of mail naar info@sp-agency.be.');
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
