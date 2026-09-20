/* ============================================================================
 *  Dárky pro miminko – logika aplikace
 *  Bez frameworku a bez build kroku. Komunikuje přímo s REST API Supabase.
 * ==========================================================================*/
(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  // Snese i adresu zkopírovanou i s koncovkou /rest/v1/
  var API = String(CFG.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
  var KEY = String(CFG.SUPABASE_ANON_KEY || '');
  var CONFIGURED = API !== '' && KEY !== '';

  var LS_CLAIMS  = 'darky.claims';   // { idDarku: token } – co jsem zamluvil z tohoto zařízení
  var LS_NAME    = 'darky.name';     // naposledy zadané jméno
  var LS_CACHE   = 'darky.cache';    // poslední načtený seznam (pro offline)
  var LS_SESSION = 'darky.session';  // přihlášení správce
  var LS_INSTALL = 'darky.installHintClosed';

  /* ------------------------------------------------------------ pomocné -- */
  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function lsGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* soukromý režim */ }
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
    });
  }

  // "1500" -> "1 500 Kč"; volný text (třeba "podle výběru") necháme být.
  function formatPrice(raw) {
    var text = String(raw == null ? '' : raw).trim();
    if (!text) return null;

    var m = text.match(/^(cca|asi|přibližně|od|do|~)?\s*([\d\s.,]+)\s*(kč|kc|czk|,-)?$/i);
    if (!m) return text;

    var num = m[2].replace(/\s/g, '').replace(',', '.');
    // Tečka bývá oddělovač tisíců (1.500), ne desetinná část.
    if (/^\d{1,3}(\.\d{3})+$/.test(num)) num = num.replace(/\./g, '');

    var n = parseFloat(num);
    if (!isFinite(n) || n < 0) return text;

    var cele = Math.floor(n);
    var desetiny = Math.round((n - cele) * 100);
    var out = String(cele).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    if (desetiny) out += ',' + (desetiny < 10 ? '0' + desetiny : desetiny);

    return (m[1] ? m[1].toLowerCase() + ' ' : '') + out + ' ' + 'Kč';
  }

  var toastTimer = null;
  function toast(message) {
    var t = $('toast');
    t.textContent = message;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3600);
  }

  function confirmDialog(title, text) {
    return new Promise(function (resolve) {
      var d = $('confirm-dialog');
      $('confirm-title').textContent = title;
      $('confirm-text').textContent = text || '';
      d.returnValue = '';
      d.addEventListener('close', function handler() {
        d.removeEventListener('close', handler);
        resolve(d.returnValue === 'ok');
      });
      d.showModal();
    });
  }

  /* ----------------------------------------------------------- síť / API -- */
  function apiMessage(payload, status) {
    var msg = (payload && (payload.message || payload.error_description || payload.error)) || '';
    if (/INVALID_NAME/.test(msg))  return 'Zadejte prosím své jméno (nejvýše 60 znaků).';
    if (/INVALID_TOKEN/.test(msg)) return 'Něco se pokazilo, zkuste to prosím znovu.';
    if (/invalid login credentials|invalid_grant|invalid grant/i.test(msg)) return 'Nesprávný e-mail nebo heslo.';
    if (/email not confirmed/i.test(msg)) return 'E-mail správce není potvrzený – v Supabase u uživatele zapněte „Auto Confirm User“.';
    if (status === 401) return 'Přihlášení vypršelo, přihlaste se prosím znovu.';
    if (status === 404) return 'Databáze není správně nastavená – ověřte, že jste v Supabase spustili schema.sql.';
    return msg || 'Něco se nepovedlo. Zkuste to prosím znovu.';
  }

  async function request(path, options) {
    if (!CONFIGURED) throw new Error('Aplikace zatím není propojená s databází (config.js).');
    var opts = options || {};
    var headers = Object.assign({
      'apikey': KEY,
      'Authorization': 'Bearer ' + (opts.token || KEY),
      'Content-Type': 'application/json'
    }, opts.headers || {});

    var res;
    try {
      res = await fetch(API + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        cache: 'no-store'
      });
    } catch (e) {
      var offline = new Error('Nepodařilo se spojit se serverem. Zkontrolujte připojení k internetu.');
      offline.offline = true;
      throw offline;
    }

    var text = await res.text();
    var data = null;
    if (text) { try { data = JSON.parse(text); } catch (e) { data = null; } }

    if (!res.ok) {
      var err = new Error(apiMessage(data, res.status));
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function rpc(name, body, token) {
    return request('/rest/v1/rpc/' + name, { method: 'POST', body: body || {}, token: token });
  }

  /* --------------------------------------------------------------- stav -- */
  var gifts = [];
  var filter = 'all';
  var myClaims = lsGet(LS_CLAIMS, {}) || {};

  /* ------------------------------------------------------- veřejný seznam -- */
  function setState(message, isError) {
    var s = $('state');
    if (!message) { s.hidden = true; return; }
    s.hidden = false;
    s.textContent = message;
    s.className = 'state' + (isError ? ' is-error' : '');
  }

  function metaRow(gift) {
    var meta = el('p', 'meta');
    if (gift.price_hint) meta.appendChild(el('span', 'price', gift.price_hint));
    if (gift.url && /^https?:\/\//i.test(gift.url)) {
      var a = el('a', 'shop-link', 'Ukázka v e-shopu →');
      a.href = gift.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      meta.appendChild(a);
    }
    return meta.children.length ? meta : null;
  }

  function giftCard(gift) {
    var mine = Object.prototype.hasOwnProperty.call(myClaims, gift.id);
    var li = el('li', 'gift' + (gift.is_claimed ? ' is-claimed' : ''));

    var head = el('div', 'gift-head');
    head.appendChild(el('h3', null, gift.title));
    if (mine)                 head.appendChild(el('span', 'tag tag-mine', 'Zamluvili jste vy'));
    else if (gift.is_claimed) head.appendChild(el('span', 'tag tag-claimed', 'Zamluveno'));
    else                      head.appendChild(el('span', 'tag tag-free', 'Volné'));
    li.appendChild(head);

    if (gift.description) li.appendChild(el('p', 'desc', gift.description));
    var meta = metaRow(gift);
    if (meta) li.appendChild(meta);

    var actions = el('div', 'gift-actions');
    if (mine) {
      var cancel = el('button', 'btn btn-ghost', 'Zrušit rezervaci');
      cancel.type = 'button';
      cancel.addEventListener('click', function () { unclaimGift(gift, cancel); });
      actions.appendChild(cancel);
    } else if (!gift.is_claimed) {
      var take = el('button', 'btn btn-primary', 'Zamluvím to já');
      take.type = 'button';
      take.addEventListener('click', function () { openClaimDialog(gift); });
      actions.appendChild(take);
    }
    if (actions.children.length) li.appendChild(actions);

    return li;
  }

  function renderPublic() {
    var list = $('gift-list');
    list.textContent = '';

    var claimed = gifts.filter(function (g) { return g.is_claimed; }).length;
    $('summary').textContent = gifts.length
      ? 'Zamluveno ' + claimed + ' z ' + gifts.length + ' dárků'
      : '';

    if (!gifts.length) { setState('Seznam je zatím prázdný.', false); return; }

    var shown = gifts.filter(function (g) {
      if (filter === 'free')    return !g.is_claimed;
      if (filter === 'claimed') return g.is_claimed;
      return true;
    });

    if (!shown.length) {
      setState(filter === 'free'
        ? 'Všechno už je zamluvené. Moc děkujeme!'
        : 'Zatím není nic zamluvené.', false);
      return;
    }

    setState('', false);
    shown.forEach(function (g) { list.appendChild(giftCard(g)); });
  }

  async function loadGifts(silent) {
    if (!CONFIGURED) {
      setState('Aplikace zatím není propojená s databází. Doplňte prosím údaje v souboru config.js (návod je v README).', true);
      return;
    }
    if (!silent && !gifts.length) setState('Načítám seznam…', false);
    try {
      var data = await rpc('list_gifts', {});
      gifts = Array.isArray(data) ? data : [];
      lsSet(LS_CACHE, gifts);
      renderPublic();
    } catch (e) {
      var cached = lsGet(LS_CACHE, null);
      if (cached && cached.length) {
        gifts = cached;
        renderPublic();
        toast(e.offline ? 'Jste offline – zobrazuji naposledy načtená data.' : e.message);
      } else {
        setState(e.message, true);
      }
    }
  }

  /* ------------------------------------------------------ zamluvení daru -- */
  var claimTarget = null;

  function openClaimDialog(gift) {
    claimTarget = gift;
    $('claim-gift-name').textContent = gift.title;
    $('claim-name').value = lsGet(LS_NAME, '') || '';
    $('claim-error').hidden = true;
    var d = $('claim-dialog');
    d.returnValue = '';
    d.showModal();
  }

  async function doClaim() {
    var gift = claimTarget;
    if (!gift) return;
    var name = $('claim-name').value.trim();
    if (!name) { toast('Zadejte prosím své jméno.'); return; }

    var token = uuid();
    try {
      var ok = await rpc('claim_gift', { p_id: gift.id, p_name: name, p_token: token });
      if (ok === false) {
        toast('Tento dárek si mezitím zamluvil někdo jiný.');
      } else {
        myClaims[gift.id] = token;
        lsSet(LS_CLAIMS, myClaims);
        lsSet(LS_NAME, name);
        toast('Hotovo, děkujeme! Dárek je zamluvený pro vás.');
      }
    } catch (e) {
      toast(e.message);
    }
    await loadGifts(true);
  }

  async function unclaimGift(gift, button) {
    var ok = await confirmDialog('Zrušit rezervaci?', gift.title + ' se vrátí mezi volné dárky.');
    if (!ok) return;
    if (button) button.disabled = true;
    try {
      var done = await rpc('unclaim_gift', { p_id: gift.id, p_token: myClaims[gift.id] });
      delete myClaims[gift.id];
      lsSet(LS_CLAIMS, myClaims);
      toast(done === false ? 'Rezervaci už zrušil někdo jiný.' : 'Rezervace zrušena.');
    } catch (e) {
      toast(e.message);
      if (button) button.disabled = false;
    }
    await loadGifts(true);
  }

  /* ============================== SPRÁVCE ================================= */
  var session = lsGet(LS_SESSION, null);
  var adminGifts = [];

  function saveSession(data) {
    if (!data || !data.access_token) return;
    session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + ((data.expires_in || 3600) * 1000) - 60000
    };
    lsSet(LS_SESSION, session);
  }

  function clearSession() {
    session = null;
    try { localStorage.removeItem(LS_SESSION); } catch (e) { /* ignore */ }
  }

  async function signIn(email, password) {
    var data = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email: email, password: password }
    });
    saveSession(data);
  }

  async function refreshSession() {
    if (!session || !session.refresh_token) throw new Error('Přihlaste se prosím znovu.');
    var data = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token }
    });
    saveSession(data);
  }

  // Požadavek správce – v případě vypršené platnosti obnoví přihlášení a zkusí to znovu.
  async function adminRequest(path, options) {
    if (!session) throw new Error('Přihlaste se prosím znovu.');
    if (session.expires_at && Date.now() > session.expires_at) await refreshSession();
    var opts = Object.assign({}, options || {}, { token: session.access_token });
    try {
      return await request(path, opts);
    } catch (e) {
      if (e.status === 401) {
        await refreshSession();
        opts.token = session.access_token;
        return await request(path, opts);
      }
      throw e;
    }
  }

  function setAdminState(message, isError) {
    var s = $('admin-state');
    if (!message) { s.hidden = true; return; }
    s.hidden = false;
    s.textContent = message;
    s.className = 'state' + (isError ? ' is-error' : '');
  }

  function adminCard(gift) {
    var li = el('li', 'gift' + (gift.claimed_by ? ' is-claimed' : ''));

    var head = el('div', 'gift-head');
    head.appendChild(el('h3', null, gift.title));
    head.appendChild(el('span', 'tag ' + (gift.claimed_by ? 'tag-claimed' : 'tag-free'),
      gift.claimed_by ? 'Zamluveno' : 'Volné'));
    li.appendChild(head);

    if (gift.description) li.appendChild(el('p', 'desc', gift.description));
    var meta = metaRow(gift);
    if (meta) li.appendChild(meta);

    if (gift.claimed_by) {
      var p = el('p', 'claimed-name');
      p.appendChild(document.createTextNode('Obstará: '));
      p.appendChild(el('strong', null, gift.claimed_by));
      if (gift.claimed_at) {
        var d = new Date(gift.claimed_at);
        if (!isNaN(d)) p.appendChild(document.createTextNode(' (' + d.toLocaleDateString('cs-CZ') + ')'));
      }
      li.appendChild(p);
    }

    var actions = el('div', 'gift-actions');

    var edit = el('button', 'btn btn-ghost', 'Upravit');
    edit.type = 'button';
    edit.addEventListener('click', function () { fillGiftForm(gift); });
    actions.appendChild(edit);

    if (gift.claimed_by) {
      var release = el('button', 'btn btn-ghost', 'Uvolnit');
      release.type = 'button';
      release.addEventListener('click', function () { adminRelease(gift); });
      actions.appendChild(release);
    }

    var del = el('button', 'btn btn-danger', 'Smazat');
    del.type = 'button';
    del.addEventListener('click', function () { adminDelete(gift); });
    actions.appendChild(del);

    li.appendChild(actions);
    return li;
  }

  function renderAdmin() {
    var list = $('admin-list');
    list.textContent = '';
    if (!adminGifts.length) { setAdminState('Zatím tu není žádný dárek. Přidejte první výše.', false); return; }
    setAdminState('', false);
    adminGifts.forEach(function (g) { list.appendChild(adminCard(g)); });
  }

  async function loadAdminGifts() {
    setAdminState('Načítám…', false);
    try {
      var data = await adminRequest('/rest/v1/gifts?select=*&order=sort_order.asc,created_at.asc');
      adminGifts = Array.isArray(data) ? data : [];
      renderAdmin();
    } catch (e) {
      setAdminState(e.message, true);
      if (/Přihlaste se/.test(e.message)) { clearSession(); showAdminLogin(); }
    }
  }

  function fillGiftForm(gift) {
    $('gift-form-title').textContent = gift ? 'Upravit dárek' : 'Nový dárek';
    $('gift-id').value          = gift ? gift.id : '';
    $('gift-title').value       = gift ? gift.title : '';
    $('gift-description').value = gift && gift.description ? gift.description : '';
    $('gift-url').value         = gift && gift.url ? gift.url : '';
    $('gift-price').value       = gift && gift.price_hint ? gift.price_hint : '';
    $('gift-form-cancel').hidden = !gift;
    $('gift-form-error').hidden = true;
    if (gift) $('gift-form-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function nextSortOrder() {
    if (!adminGifts.length) return 10;
    return Math.max.apply(null, adminGifts.map(function (g) { return g.sort_order || 0; })) + 10;
  }

  async function saveGift(event) {
    event.preventDefault();
    var id = $('gift-id').value;
    var payload = {
      title: $('gift-title').value.trim(),
      description: $('gift-description').value.trim() || null,
      url: $('gift-url').value.trim() || null,
      price_hint: formatPrice($('gift-price').value)
    };
    // Nový dárek se zařadí na konec seznamu; u úprav pořadí neměníme.
    if (!id) payload.sort_order = nextSortOrder();
    if (!payload.title) { showFormError('Zadejte prosím název dárku.'); return; }

    var button = $('gift-form').querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      if (id) {
        await adminRequest('/rest/v1/gifts?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: payload });
        toast('Dárek upraven.');
      } else {
        await adminRequest('/rest/v1/gifts', { method: 'POST', body: payload });
        toast('Dárek přidán.');
      }
      fillGiftForm(null);
      await loadAdminGifts();
    } catch (e) {
      showFormError(e.message);
    } finally {
      button.disabled = false;
    }
  }

  function showFormError(message) {
    var p = $('gift-form-error');
    p.textContent = message;
    p.hidden = false;
  }

  async function adminDelete(gift) {
    var ok = await confirmDialog('Smazat dárek?', gift.title + ' bude ze seznamu odstraněn.');
    if (!ok) return;
    try {
      await adminRequest('/rest/v1/gifts?id=eq.' + encodeURIComponent(gift.id), { method: 'DELETE' });
      toast('Dárek smazán.');
      await loadAdminGifts();
    } catch (e) { toast(e.message); }
  }

  async function adminRelease(gift) {
    var ok = await confirmDialog('Uvolnit dárek?', 'Rezervace (' + gift.claimed_by + ') bude zrušena.');
    if (!ok) return;
    try {
      await adminRequest('/rest/v1/gifts?id=eq.' + encodeURIComponent(gift.id), {
        method: 'PATCH',
        body: { claimed_by: null, claimed_at: null, claim_token: null }
      });
      toast('Dárek je zase volný.');
      await loadAdminGifts();
    } catch (e) { toast(e.message); }
  }

  function showAdminLogin() {
    $('admin-login').hidden = false;
    $('admin-panel').hidden = true;
  }

  function showAdminPanel() {
    $('admin-login').hidden = true;
    $('admin-panel').hidden = false;
    fillGiftForm(null);
    loadAdminGifts();
  }

  async function onLogin(event) {
    event.preventDefault();
    var err = $('login-error');
    err.hidden = true;
    var button = $('login-form').querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await signIn($('login-email').value.trim(), $('login-password').value);
      $('login-password').value = '';
      showAdminPanel();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    } finally {
      button.disabled = false;
    }
  }

  function onLogout() {
    if (session) {
      // Odhlášení na serveru je jen úklid – chybu ignorujeme.
      request('/auth/v1/logout', { method: 'POST', token: session.access_token, body: {} }).catch(function () {});
    }
    clearSession();
    showAdminLogin();
    toast('Odhlášeno.');
  }

  /* ---------------------------------------------------------- směrování -- */
  function route() {
    var isAdmin = window.location.hash === '#admin';
    $('view-public').hidden = isAdmin;
    $('view-admin').hidden = !isAdmin;
    window.scrollTo(0, 0);
    if (isAdmin) {
      if (session) showAdminPanel(); else showAdminLogin();
    } else {
      loadGifts(true);
    }
  }

  /* ------------------------------------------------ instalace na plochu -- */
  var deferredPrompt = null;

  function setupInstallHint() {
    var box = $('install-hint');
    var isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
    box.hidden = true;

    // Křížek musí fungovat vždy, i když se lišta nakonec vůbec nenabídne.
    $('install-close').addEventListener('click', function () {
      box.hidden = true;
      lsSet(LS_INSTALL, true);
    });

    $('install-btn').addEventListener('click', async function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      box.hidden = true;
    });

    // Po instalaci lištu schováme a už ji nikdy nenabízíme.
    window.addEventListener('appinstalled', function () {
      box.hidden = true;
      lsSet(LS_INSTALL, true);
    });

    // Už nainstalováno nebo jednou odmítnuto – lištu vůbec nenabízíme.
    var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (standalone || lsGet(LS_INSTALL, false)) return;

    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      $('install-text').textContent = 'Tip: přidejte si aplikaci na plochu – v Safari klepněte na ikonu Sdílet a zvolte „Přidat na plochu“.';
      box.hidden = false;
    }

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      $('install-text').textContent = isMobile
        ? 'Aplikaci si můžete přidat na plochu telefonu.'
        : 'Aplikaci si můžete nainstalovat do počítače.';
      $('install-btn').textContent = isMobile ? 'Přidat na plochu' : 'Nainstalovat';
      $('install-btn').hidden = false;
      box.hidden = false;
    });
  }

  /* ----------------------------------------------------------- spuštění -- */
  function init() {
    if (CFG.APP_TITLE) {
      document.title = CFG.APP_TITLE;
      document.querySelector('#view-public h1').textContent = CFG.APP_TITLE;
    }

    Array.prototype.forEach.call(document.querySelectorAll('.filter'), function (btn) {
      btn.addEventListener('click', function () {
        filter = btn.dataset.filter;
        Array.prototype.forEach.call(document.querySelectorAll('.filter'), function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        renderPublic();
      });
    });

    $('refresh-btn').addEventListener('click', function () { loadGifts(false); });
    $('claim-dialog').addEventListener('close', function () {
      if ($('claim-dialog').returnValue === 'ok') doClaim();
    });
    $('login-form').addEventListener('submit', onLogin);
    $('gift-form').addEventListener('submit', saveGift);
    $('gift-form-cancel').addEventListener('click', function () { fillGiftForm(null); });
    $('gift-price').addEventListener('blur', function () {
      var v = formatPrice(this.value);
      this.value = v == null ? '' : v;
    });
    $('logout-btn').addEventListener('click', onLogout);

    window.addEventListener('hashchange', route);
    window.addEventListener('online', function () { loadGifts(true); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && window.location.hash !== '#admin') loadGifts(true);
    });

    setupInstallHint();
    route();
    if (window.location.hash !== '#admin') loadGifts(false);

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* nevadí */ });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
