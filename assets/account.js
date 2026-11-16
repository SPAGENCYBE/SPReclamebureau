/* SP Reclamebureau — Mijn account */
(() => {
  const API = (document.querySelector('meta[name="sp-shop-api"]')?.content || '').replace(/\/$/, '');
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const eur = (n) => '€ ' + Number(n || 0).toFixed(2).replace('.', ',');
  const date = (iso) => new Date(iso).toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
  const store = {
    get: () => { try { return localStorage.getItem('sp-auth') || ''; } catch { return ''; } },
    set: (t) => { try { t ? localStorage.setItem('sp-auth', t) : localStorage.removeItem('sp-auth'); } catch { /* */ } },
  };
  const state = { token: store.get(), user: null, mail: false, orders: [], tab: 'orders', codeEmail: '', next: new URLSearchParams(location.search).get('next') };

  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) };
    const res = await fetch(API + path, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && state.token && path.startsWith('/api/account')) { logoutLocal(); }
    if (!res.ok) throw new Error(data.error || 'Er ging iets mis. Probeer opnieuw.');
    return data;
  }
  const post = (p, b, m = 'POST') => api(p, { method: m, body: JSON.stringify(b) });
  const msg = (el, text, ok) => { el.innerHTML = text ? `<div class="msg ${ok ? 'ok' : 'err'}">${esc(text)}</div>` : ''; };

  function logoutLocal() { state.token = ''; state.user = null; store.set(''); render(); }

  function afterLogin(r) {
    state.token = r.token; store.set(r.token); state.user = r.user;
    if (state.next === 'webshop') { location.href = 'webshop.html#checkout'; return; }
    load();
  }

  // ---------- niet ingelogd ----------
  function renderAuth(mode = 'login') {
    const root = $('#accountRoot');
    const tabs = `<div class="acc-tabs"><button type="button" data-mode="login" class="${mode === 'login' || mode === 'code' || mode === 'verify' ? 'active' : ''}">Inloggen</button><button type="button" data-mode="register" class="${mode === 'register' ? 'active' : ''}">Account aanmaken</button></div>`;
    let body = '';
    if (mode === 'login') {
      body = `<form id="loginForm" class="acc-form">
        <label class="field">E-mailadres<input type="email" name="email" required autocomplete="email"></label>
        <label class="field">Wachtwoord<input type="password" name="password" required autocomplete="current-password"></label>
        <div id="authMsg"></div>
        <button class="btn" type="submit">Inloggen</button>
        <p class="acc-alt"><button type="button" class="link" data-mode="code">Inloggen met een code per e-mail</button> · <button type="button" class="link" data-mode="code">Wachtwoord vergeten?</button></p>
      </form>`;
    } else if (mode === 'code') {
      body = `<form id="codeForm" class="acc-form">
        <p class="muted">We sturen je een inlogcode van 6 cijfers. Na het inloggen kan je ook een (nieuw) wachtwoord instellen.</p>
        <label class="field">E-mailadres<input type="email" name="email" required autocomplete="email" value="${esc(state.codeEmail)}"></label>
        <div id="authMsg"></div>
        <button class="btn" type="submit">Stuur mij een code</button>
        <p class="acc-alt"><button type="button" class="link" data-mode="login">← Terug naar inloggen met wachtwoord</button></p>
      </form>`;
    } else if (mode === 'verify') {
      body = `<form id="verifyForm" class="acc-form">
        <p>We stuurden een code naar <strong>${esc(state.codeEmail)}</strong>. Kijk ook even in je spam.</p>
        <label class="field">Code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required class="code-input" placeholder="123456"></label>
        <div id="authMsg"></div>
        <button class="btn" type="submit">Inloggen</button>
        <p class="acc-alt"><button type="button" class="link" data-mode="code">Nieuwe code aanvragen</button></p>
      </form>`;
    } else {
      body = `<form id="registerForm" class="acc-form">
        <div class="form-grid">
          <label class="field c3">Voornaam<input name="first_name" required autocomplete="given-name"></label>
          <label class="field c3">Achternaam<input name="last_name" required autocomplete="family-name"></label>
          <label class="field c6">Bedrijf <small>(optioneel)</small><input name="company" autocomplete="organization"></label>
          <label class="field c6">E-mailadres<input type="email" name="email" required autocomplete="email"></label>
          <label class="field c6">Wachtwoord <small>(minstens 8 tekens)</small><input type="password" name="password" minlength="8" required autocomplete="new-password"></label>
        </div>
        <div id="authMsg"></div>
        <button class="btn" type="submit">Account aanmaken</button>
      </form>`;
    }
    root.innerHTML = `<div class="acc-auth">${tabs}${body}
      <div class="acc-why"><h3>Waarom een account?</h3><ul>
        <li>Al je bestellingen en hun status op één plek</li><li>Je ontwerpen terugvinden en met één klik opnieuw bestellen</li>
        <li>Gegevens en leveradressen bewaard: sneller afrekenen</li><li>Bestelbevestigingen en facturen downloaden</li></ul></div></div>`;
    state.authMode = mode;
  }

  // ---------- ingelogd ----------
  function renderOrders() {
    if (!state.orders.length) return '<p class="muted">Je hebt nog geen bestellingen. <a class="accent" href="webshop.html">Naar de webshop</a></p>';
    return state.orders.map((o) => `
      <article class="acc-order">
        <header><div><strong>${esc(o.id)}</strong><span class="muted"> · ${date(o.created_at)}</span></div>
          <span class="acc-badge s-${esc(o.status)}">${esc(o.status_label)}</span></header>
        <ul class="acc-lines">${o.lines.map((l, i) => `<li><div><strong>${esc(l.title)}</strong><small class="muted">${esc(l.summary)}</small></div>
          <div class="acc-line-r"><span>${eur(l.incl)}</span><a class="btn outline small" href="webshop.html?reorder=${encodeURIComponent(o.id)}:${i}">Opnieuw bestellen</a></div></li>`).join('')}</ul>
        ${o.payment ? `<div class="acc-pay">Nog te betalen: <strong>${eur(o.payment.amount)}</strong> op ${esc(o.payment.iban)} met mededeling <strong>${esc(o.payment.reference)}</strong></div>` : ''}
        <footer><span>Totaal <strong>${eur(o.totals.total_incl)}</strong></span>
          <span class="acc-actions">${o.tracking_url ? `<a class="accent" href="${esc(o.tracking_url)}" target="_blank" rel="noopener">Volg je pakket</a>` : ''}
          <a class="accent" href="${API}/api/order/${encodeURIComponent(o.id)}/invoice?t=${encodeURIComponent(o.token)}" target="_blank" rel="noopener">${o.invoice_no ? `Factuur ${esc(o.invoice_no)}` : 'Bestelbevestiging'}</a>
          <a class="accent" href="bedankt.html?order=${encodeURIComponent(o.id)}&t=${encodeURIComponent(o.token)}">Status</a></span></footer>
      </article>`).join('');
  }

  function renderFiles() {
    const items = [];
    for (const o of state.orders) o.lines.forEach((l, i) => { if (l.files.length) items.push({ o, l, i }); });
    if (!items.length) return '<p class="muted">Hier verschijnen de ontwerpen van je bestellingen.</p>';
    return `<div class="acc-files">${items.map(({ o, l, i }) => `
      <div class="acc-file"><div><strong>${esc(l.title)}</strong><small class="muted">${date(o.created_at)} · ${esc(o.id)}</small>
        <ul>${l.files.map((f) => `<li>${f.side === 'back' ? 'Achterkant' : 'Voorkant'}: ${f.url ? `<a class="accent" href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : esc(f.name)}</li>`).join('')}</ul></div>
        <a class="btn outline small" href="webshop.html?reorder=${encodeURIComponent(o.id)}:${i}">Opnieuw bestellen</a></div>`).join('')}</div>`;
  }

  function addrForm(a, idx) {
    const f = (k, label, cls = 'c3', extra = '') => `<label class="field ${cls}">${label}<input name="${k}" value="${esc(a[k] || '')}" ${extra}></label>`;
    return `<fieldset class="acc-addr" data-idx="${idx}"><div class="form-grid">
      ${f('label', 'Naam van dit adres', 'c6', 'placeholder="bv. Winkel, Magazijn"')}
      ${f('company', 'Bedrijf', 'c6')}${f('first_name', 'Voornaam')}${f('last_name', 'Achternaam')}
      ${f('street', 'Straat', 'c4')}<label class="field" style="grid-column:span 1">Nr.<input name="house_number" value="${esc(a.house_number || '')}"></label><label class="field" style="grid-column:span 1">Bus<input name="addition" value="${esc(a.addition || '')}"></label>
      ${f('postal_code', 'Postcode', 'c2')}${f('city', 'Gemeente', 'c2')}
      <label class="field c2">Land<select name="country">${['BE', 'NL', 'LU', 'FR', 'DE'].map((c) => `<option ${a.country === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    </div><button type="button" class="link" data-remove-addr="${idx}">Adres verwijderen</button></fieldset>`;
  }

  function renderDetails() {
    const u = state.user, p = u.profile;
    const f = (k, label, cls = 'c3', type = 'text') => `<label class="field ${cls}">${label}<input type="${type}" name="${k}" value="${esc(p[k] || '')}"></label>`;
    return `<form id="profileForm" class="acc-form wide">
        <h3>Gegevens</h3>
        <div class="form-grid">${f('first_name', 'Voornaam')}${f('last_name', 'Achternaam')}${f('company', 'Bedrijf', 'c3')}${f('vat_number', 'Btw-nummer', 'c3')}${f('phone', 'Telefoon', 'c3', 'tel')}
          <label class="field c3">E-mailadres<input value="${esc(u.email)}" disabled></label></div>
        <h3 style="margin-top:26px">Leveradressen</h3>
        <div id="addrList">${(u.addresses || []).map(addrForm).join('') || '<p class="muted">Nog geen adressen bewaard.</p>'}</div>
        <button type="button" class="btn outline small" id="addAddr">+ Adres toevoegen</button>
        <div id="profileMsg"></div>
        <button class="btn" type="submit" style="margin-top:14px">Opslaan</button>
      </form>
      <form id="passwordForm" class="acc-form wide">
        <h3>${u.has_password ? 'Wachtwoord wijzigen' : 'Wachtwoord instellen'}</h3>
        <div class="form-grid">${u.has_password ? '<label class="field c3">Huidig wachtwoord<input type="password" name="current_password" autocomplete="current-password"></label>' : ''}
          <label class="field c3">Nieuw wachtwoord<input type="password" name="new_password" minlength="8" required autocomplete="new-password"></label></div>
        ${u.has_password ? '<p class="muted" style="font-size:13px">Huidig wachtwoord vergeten? Log uit en log in met een code; daarna kan je een nieuw wachtwoord kiezen.</p>' : ''}
        <div id="pwMsg"></div><button class="btn" type="submit">Opslaan</button>
      </form>`;
  }

  function renderAccount() {
    const u = state.user;
    const tabs = [['orders', `Bestellingen (${state.orders.length})`], ['files', 'Bestanden'], ['details', 'Gegevens & adressen']];
    $('#accountRoot').innerHTML = `
      <div class="acc-head"><div><h2>Hallo${u.profile.first_name ? ' ' + esc(u.profile.first_name) : ''}!</h2><p class="muted">${esc(u.email)}</p></div>
        <div><a class="btn" href="webshop.html">Naar de webshop</a> <button type="button" class="btn outline" id="logoutBtn">Uitloggen</button></div></div>
      <div class="acc-tabs">${tabs.map(([k, l]) => `<button type="button" data-tab="${k}" class="${state.tab === k ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="acc-panel">${state.tab === 'orders' ? renderOrders() : state.tab === 'files' ? renderFiles() : renderDetails()}</div>`;
  }

  function render() { if (state.user) renderAccount(); else renderAuth(state.authMode || 'login'); }

  async function load() {
    $('#accountRoot').innerHTML = '<p class="muted"><span class="spinner"></span> Laden…</p>';
    try {
      const a = await api('/api/account');
      state.user = a.user; state.mail = a.mail;
      state.orders = (await api('/api/account/orders')).orders;
    } catch { state.user = null; }
    render();
  }

  function collectAddresses() {
    return [...document.querySelectorAll('.acc-addr')].map((fs) => {
      const o = {}; fs.querySelectorAll('input[name],select[name]').forEach((i) => { o[i.name] = i.value; });
      o.id = (state.user.addresses[Number(fs.dataset.idx)] || {}).id; return o;
    });
  }

  // ---------- events ----------
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.mode) { e.preventDefault(); renderAuth(t.dataset.mode); }
    else if (t.dataset.tab) { state.tab = t.dataset.tab; renderAccount(); }
    else if (t.id === 'logoutBtn') { try { await post('/api/auth/logout', {}); } catch { /* */ } logoutLocal(); }
    else if (t.id === 'addAddr') { state.user.addresses = [...collectAddresses(), { country: 'BE' }]; $('#addrList').innerHTML = state.user.addresses.map(addrForm).join(''); }
    else if (t.dataset.removeAddr !== undefined) { const a = collectAddresses(); a.splice(Number(t.dataset.removeAddr), 1); state.user.addresses = a; $('#addrList').innerHTML = a.map(addrForm).join('') || '<p class="muted">Nog geen adressen bewaard.</p>'; }
  });

  document.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, data = Object.fromEntries(new FormData(f));
    const btn = f.querySelector('button[type=submit]'); if (btn) btn.disabled = true;
    try {
      if (f.id === 'loginForm') afterLogin(await post('/api/auth/login', data));
      else if (f.id === 'registerForm') afterLogin(await post('/api/auth/register', data));
      else if (f.id === 'codeForm') { state.codeEmail = data.email; await post('/api/auth/code', data); renderAuth('verify'); }
      else if (f.id === 'verifyForm') afterLogin(await post('/api/auth/verify', { email: state.codeEmail, code: data.code }));
      else if (f.id === 'profileForm') {
        const profile = {}; ['first_name', 'last_name', 'company', 'vat_number', 'phone'].forEach((k) => { profile[k] = data[k] || ''; });
        const r = await post('/api/account', { profile, addresses: collectAddresses() }, 'PUT');
        state.user = r.user; renderAccount(); msg($('#profileMsg'), 'Opgeslagen.', true);
      } else if (f.id === 'passwordForm') {
        await post('/api/account/password', data); state.user.has_password = true; renderAccount(); msg($('#pwMsg'), 'Je wachtwoord is opgeslagen.', true);
      }
    } catch (err) {
      const box = f.querySelector('#authMsg, #profileMsg, #pwMsg'); if (box) msg(box, err.message);
    } finally { if (btn) btn.disabled = false; }
  });

  document.addEventListener('DOMContentLoaded', () => { if (state.token) load(); else render(); });
})();
