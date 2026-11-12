/* Account menu: the picture button and the menu that opens from it, like the one Google has. One file, no dependencies.
   The site gives it the signed-in person and says what each button does; this file only draws it and handles keys and focus.

   A picture button:   PmcAccount.mount(element, function () { return options; })   (the element must be empty)
   Any button of your own (a sidebar footer, say):   PmcAccount.toggle(button, function () { return options; })

   options = {
     user:   { name, email, img } or null when nobody is signed in   (img is optional: a picture address or a data: picture)
     others: [ { id, name, email, img } ]    the other accounts added on this device (leave out for none)
     manage: 'https://accounts.pmcstudios.uk/'       where "Manage your PMC Account" goes
     privacy: 'https://accounts.pmcstudios.uk/privacy/'
     onSettings(), onSignIn(), onAddAccount(), onSwitch(account), onSignOut()    a button shows only when its function is given
   }

   Other accounts: PmcAccount.remember(user) keeps a name, an email and a tiny picture for each account used on this device (no passwords, no keys),
   PmcAccount.others(email) lists the rest, PmcAccount.forget(email) takes one off. Each site keeps its own list. */
(function () {
  if (window.PmcAccount) return;
  var S = 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter"';
  var ICON = {
    user: '<svg viewBox="0 0 24 24" width="24" height="24" ' + S + ' aria-hidden="true"><path d="M8 4h8v8H8zM4 21v-3h16v3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="22" height="22" ' + S + ' aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="22" height="22" ' + S + ' aria-hidden="true"><path d="M10 3h4v3l2.2 1.3L19 5.8l2 3.4-2.8 1.5v2.6l2.8 1.5-2 3.4-2.8-1.5L14 18v3h-4v-3l-2.2-1.3L5 18.2l-2-3.4 2.8-1.5v-2.6L3 9.2l2-3.4 2.8 1.5L10 6z"/><path d="M10 10h4v4h-4z"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="18" height="18" ' + S + ' aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    out: '<svg viewBox="0 0 24 24" width="22" height="22" ' + S + ' aria-hidden="true"><path d="M10 4H4v16h6M9 12h12M16 7l5 5-5 5"/></svg>'
  };
  var CSS = '.pa-btn{display:inline-grid;place-items:center;width:var(--pa-size,40px);height:var(--pa-size,40px);padding:0;margin:0;overflow:hidden;background:var(--pa-bg,#337957);color:var(--pa-fg,#F2E4CE);border:var(--pa-frame,3px) solid var(--pa-ring,#171717);border-radius:0;cursor:pointer;box-shadow:var(--pa-shadow,none);font-family:var(--d,"PMC Header","Shoulders","Arial Narrow",Impact,sans-serif);font-size:calc(var(--pa-size,40px) * .5);line-height:1;text-transform:uppercase;font-synthesis:none;transition:box-shadow .1s,transform .1s;-webkit-tap-highlight-color:transparent}'
    + '.pa-btn:hover,.pa-btn[aria-expanded="true"]{box-shadow:var(--pa-shadow-hover,0 0 0 3px var(--pa-ring,#171717))}'
    + '.pa-btn:focus-visible{outline:4px solid #337957;outline-offset:3px}'
    + '.pa-btn img,.pa-i img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.pa-pop{position:fixed;z-index:2147483000;width:min(376px,calc(100vw - 16px));max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);overflow:auto;overscroll-behavior:contain;background:#F2E4CE;color:#171717;border:3px solid #171717;box-shadow:8px 8px 0 #1A4934;font-family:var(--t,"PMC Font","Plex","Courier New",monospace);font-synthesis:none;-webkit-font-smoothing:antialiased;line-height:1.25;animation:paup .16s cubic-bezier(.16,1,.3,1) backwards}'
    + '.pa-pop[hidden]{display:none}'
    + '.pa-d{font-family:var(--d,"PMC Header","Shoulders","Arial Narrow",Impact,sans-serif);text-transform:uppercase;font-weight:400;letter-spacing:.03em;line-height:.95}'
    + '.pa-me{display:grid;justify-items:center;gap:4px;padding:26px 16px 20px;text-align:center}'
    + '.pa-av{display:grid;place-items:center;overflow:hidden;width:96px;height:96px;background:#337957;color:#F2E4CE;border:3px solid #171717;box-shadow:5px 5px 0 #1A4934;font-size:3.4rem;line-height:1}'
    + '.pa-av img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.pa-name{font-size:2.1rem;margin-top:14px;overflow-wrap:anywhere}'
    + '.pa-mail{font-size:.95rem;overflow-wrap:anywhere}'
    + '.pa-sub{font-size:1.05rem;max-width:30ch;margin-top:14px;text-wrap:balance}'
    + '.pa-manage{margin-top:14px;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 18px;background:#171717;color:#F2E4CE;border:2px solid #171717;box-shadow:3px 3px 0 #1A4934;text-decoration:none;font-size:1.25rem;cursor:pointer;transition:transform .1s,box-shadow .1s;font-family:var(--d,"PMC Header","Shoulders","Arial Narrow",Impact,sans-serif);text-transform:uppercase;letter-spacing:.03em;line-height:1}'
    + '.pa-manage:hover{transform:translate(-2px,-2px);box-shadow:5px 5px 0 #1A4934}'
    + '.pa-manage:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #1A4934;transition-duration:.04s}'
    + '.pa-manage:focus-visible{outline:4px solid #337957;outline-offset:3px}'
    + '.pa-list{list-style:none;margin:0;padding:0;border-top:3px solid #171717}'
    + '.pa-list li+li{border-top:2px solid #CDBB98}'
    + '.pa-row{display:flex;align-items:center;gap:14px;width:100%;min-height:60px;padding:9px 16px;margin:0;background:transparent;color:#171717;border:0;border-radius:0;text-align:left;text-decoration:none;font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}'
    + '.pa-row:hover,.pa-row:focus-visible{background:#D5E8DC;outline:none}'
    + '.pa-row:focus-visible{box-shadow:inset 0 0 0 3px #337957}'
    + '.pa-rw{display:flex;align-items:stretch}.pa-rw .pa-row{flex:1;min-width:0}'
    + '.pa-x{flex:none;display:grid;place-items:center;width:52px;margin:0;padding:0;background:transparent;color:#171717;border:0;border-left:2px solid #CDBB98;border-radius:0;cursor:pointer}'
    + '.pa-x:hover,.pa-x:focus-visible{background:#171717;color:#F2E4CE;outline:none}'
    + '.pa-i{display:grid;place-items:center;flex:none;overflow:hidden;width:40px;height:40px;background:#337957;color:#F2E4CE;border:2px solid #171717;font-size:1.5rem;line-height:1}'
    + '.pa-i.pa-ic{background:transparent;color:#171717}'
    + '.pa-t{display:grid;gap:3px;min-width:0}'
    + '.pa-t b{font-weight:400;font-size:1.3rem}'
    + '.pa-t span{font-size:.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.pa-foot{border-top:3px solid #171717;padding:10px 16px;font-size:.85rem}'
    + '.pa-foot a{color:#171717;text-decoration:underline;text-underline-offset:3px}'
    + '.pa-foot a:hover{background:#D5E8DC}'
    + '@keyframes paup{from{opacity:0;transform:translateY(8px)}}'
    + '@media (prefers-reduced-motion:reduce){.pa-pop{animation:none}.pa-manage{transition:none}}';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function css() { if (document.getElementById('pmc-account-css') || document.querySelector('link[data-pmc-menus]')) return; var s = document.createElement('style'); s.id = 'pmc-account-css'; s.textContent = CSS; document.head.appendChild(s); }
  function safeImg(v) { return typeof v === 'string' && (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v)) ? v : ''; }
  function letter(u) { var t = (u && (u.name || u.email)) || ''; var c = String(t).trim().charAt(0); return c ? c.toUpperCase() : ''; }
  function pic(u, cls) { var im = safeImg(u && u.img); return im ? '<img src="' + esc(im) + '" alt="">' : (letter(u) ? esc(letter(u)) : ICON.user); }
  function first(u) { var n = (u && u.name) || ''; if (!n && u && u.email) n = String(u.email).split('@')[0]; return n; }

  /* The accounts used on this device (this site only): an email, a name and a 64px picture. Never a password or a key. */
  var KEY = 'pmc:accounts', MAX = 6;
  function mailOk(m) { return typeof m === 'string' && m.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m); }
  function list() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || '[]'); if (!Array.isArray(v)) return [];
      return v.filter(function (a) { return a && mailOk(a.email); }).slice(0, MAX).map(function (a) { return { id: String(a.email).toLowerCase(), email: String(a.email), name: String(a.name || '').slice(0, 60), img: safeImg(a.img) }; });
    } catch (e) { return []; }
  }
  function store(l) { try { localStorage.setItem(KEY, JSON.stringify(l.slice(0, MAX))); } catch (e) { /* storage blocked */ } }
  function others(email) { var m = String(email || '').toLowerCase(); return list().filter(function (a) { return a.id !== m; }); }
  function forget(email) { var m = String(email || '').toLowerCase(); store(list().filter(function (a) { return a.id !== m; })); }
  function remember(user, done) {
    if (!user || !mailOk(user.email)) { if (done) done(); return; }
    var id = String(user.email).toLowerCase(), name = String(user.name || '').slice(0, 60);
    function put(img) { var l = list().filter(function (a) { return a.id !== id; }); l.unshift({ id: id, email: user.email, name: name, img: img || '' }); store(l); if (done) done(); }
    var src = safeImg(user.img);
    if (!src || src.indexOf('data:') !== 0) { var old = list().filter(function (a) { return a.id === id; })[0]; put(old ? old.img : ''); return; }
    try {
      var im = new Image(); im.onload = function () {
        try { var c = document.createElement('canvas'); c.width = c.height = 64; var g = c.getContext('2d'); var side = Math.min(im.naturalWidth, im.naturalHeight); g.drawImage(im, (im.naturalWidth - side) / 2, (im.naturalHeight - side) / 2, side, side, 0, 0, 64, 64); var out = c.toDataURL('image/webp', 0.8); if (out.indexOf('data:image/webp') !== 0) out = c.toDataURL('image/jpeg', 0.8); put(out); } catch (e) { put(''); }
      }; im.onerror = function () { put(''); }; im.src = src;
    } catch (e) { put(''); }
  }

  var EXT = /^(chrome|moz|safari-web)-extension:$/.test(location.protocol), TGT = EXT ? ' target="_blank" rel="noopener noreferrer"' : '';
  var open = null;
  function close(focusBack) {
    if (!open) return; var o = open; open = null;
    o.pop.remove(); o.anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', o.onDown, true); document.removeEventListener('keydown', o.onKey, true); removeEventListener('resize', o.onResize); removeEventListener('scroll', o.onResize, true);
    if (focusBack) o.anchor.focus();
  }
  function place(o) {
    var r = o.anchor.getBoundingClientRect(), w = o.pop.offsetWidth, h = o.pop.offsetHeight, m = 8, gap = 10;
    var left = r.left + r.width / 2 < innerWidth / 2 ? r.left : r.right - w;
    left = Math.min(Math.max(m, left), innerWidth - w - m);
    var below = innerHeight - r.bottom - gap - m, above = r.top - gap - m, top;
    if (h <= below || below >= above) top = r.bottom + gap; else top = r.top - gap - h;
    o.pop.style.left = left + 'px'; o.pop.style.top = Math.min(Math.max(m, top), Math.max(m, innerHeight - h - m)) + 'px';
  }
  function build(op) {
    var u = op.user, h = '';
    if (u) {
      h += '<div class="pa-me"><span class="pa-av pa-d">' + pic(u) + '</span>'
        + '<b class="pa-name pa-d">' + esc(first(u)) + '</b>' + (u.email ? '<span class="pa-mail">' + esc(u.email) + '</span>' : '')
        + '<a class="pa-manage" data-pa="manage" href="' + esc(op.manage || 'https://accounts.pmcstudios.uk/') + '"' + TGT + '>Manage your PMC Account</a></div>';
    } else {
      h += '<div class="pa-me"><span class="pa-av pa-d">' + ICON.user.replace('width="24" height="24"', 'width="52" height="52"') + '</span>'
        + '<span class="pa-sub">One PMC Account for every PMC site.</span>'
        + (op.onSignIn ? '<button type="button" class="pa-manage" data-pa="signin">Sign in</button>' : '<a class="pa-manage" data-pa="manage" href="' + esc(op.manage || 'https://accounts.pmcstudios.uk/') + '"' + TGT + '>Sign in</a>') + '</div>';
    }
    var rows = [], i, a, others = (op.others || []);
    for (i = 0; i < others.length; i++) {
      a = others[i];
      rows.push('<div class="pa-rw"><button type="button" class="pa-row" data-pa="switch" data-i="' + i + '"><span class="pa-i pa-d">' + pic(a) + '</span><span class="pa-t"><b class="pa-d">' + esc(first(a)) + '</b><span>' + esc(a.email || '') + '</span></span></button>'
        + '<button type="button" class="pa-x" data-pa="forget" data-i="' + i + '" aria-label="Remove ' + esc(a.email || first(a)) + ' from this device" title="Remove from this device">' + ICON.x + '</button></div>');
    }
    if (u && op.onAddAccount) rows.push('<button type="button" class="pa-row" data-pa="add"><span class="pa-i pa-ic">' + ICON.plus + '</span><span class="pa-t"><b class="pa-d">Add another account</b></span></button>');
    if (op.onSettings) rows.push('<button type="button" class="pa-row" data-pa="settings"><span class="pa-i pa-ic">' + ICON.gear + '</span><span class="pa-t"><b class="pa-d">Settings</b></span></button>');
    if (u && op.onSignOut) rows.push('<button type="button" class="pa-row" data-pa="out"><span class="pa-i pa-ic">' + ICON.out + '</span><span class="pa-t"><b class="pa-d">Sign out</b></span></button>');
    if (rows.length) h += '<ul class="pa-list">' + rows.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>';
    if (op.privacy) h += '<div class="pa-foot"><a href="' + esc(op.privacy) + '"' + TGT + '>Privacy</a></div>';
    return h;
  }
  function toggle(anchor, get, byKey) {
    if (!anchor) return; css();
    if (open && open.anchor === anchor) { close(false); return; }
    close(false);
    var op = (typeof get === 'function' ? get() : get) || {};
    var pop = document.createElement('div'); pop.className = 'pa-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Account menu');
    pop.innerHTML = build(op); document.body.appendChild(pop); anchor.setAttribute('aria-expanded', 'true');
    var o = { anchor: anchor, pop: pop }; open = o; place(o);
    o.onDown = function (e) { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(false); };
    o.onKey = function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(true); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        var t = Array.prototype.slice.call(pop.querySelectorAll('.pa-manage,.pa-row,.pa-foot a')), i = t.indexOf(document.activeElement);
        e.preventDefault(); var n = i < 0 ? 0 : e.key === 'ArrowDown' ? Math.min(t.length - 1, i + 1) : Math.max(0, i - 1); t[n] && t[n].focus();
      }
    };
    o.onResize = function () { place(o); };
    pop.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-pa]'); if (!b || !pop.contains(b)) return;
      var k = b.getAttribute('data-pa');
      if (k === 'manage') { if (op.onManage) { e.preventDefault(); close(false); op.onManage(); } else close(false); return; }
      if (k === 'forget') {
        var ac = (op.others || [])[+b.getAttribute('data-i')]; if (!ac) return;
        if (op.onForget) op.onForget(ac); else forget(ac.email);
        op.others = (op.others || []).filter(function (x) { return x !== ac; });
        var li = b.closest('li'); if (li) li.remove(); place(o); return;
      }
      close(false);
      if (k === 'signin' && op.onSignIn) op.onSignIn();
      else if (k === 'add' && op.onAddAccount) op.onAddAccount();
      else if (k === 'settings' && op.onSettings) op.onSettings();
      else if (k === 'out' && op.onSignOut) op.onSignOut();
      else if (k === 'switch' && op.onSwitch) op.onSwitch((op.others || [])[+b.getAttribute('data-i')]);
    });
    document.addEventListener('mousedown', o.onDown, true); document.addEventListener('keydown', o.onKey, true); addEventListener('resize', o.onResize); addEventListener('scroll', o.onResize, true);
    if (byKey) { var f = pop.querySelector('.pa-manage'); f && f.focus(); }
  }
  /* The picture button. It redraws itself with refresh() when the person or their picture changes. */
  function mount(el, get) {
    if (!el || el.getAttribute('data-pmc-account-ready')) return; el.setAttribute('data-pmc-account-ready', '1'); css();
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pa-btn'; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false');
    function paint() {
      var op = (typeof get === 'function' ? get() : get) || {}, u = op.user;
      btn.innerHTML = pic(u).replace(/width="24" height="24"/, 'width="60%" height="60%"');
      btn.setAttribute('aria-label', u ? 'Account menu, ' + (u.email || first(u)) : 'Account menu, not signed in'); btn.title = u ? (u.email || first(u)) : 'Sign in';
    }
    paint();
    btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(btn, get, e.detail === 0); });
    btn.refresh = paint; el.appendChild(btn); return btn;
  }
  window.PmcAccount = { css: CSS, mount: mount, toggle: toggle, close: function () { close(false); }, remember: remember, others: others, forget: forget };
})();
