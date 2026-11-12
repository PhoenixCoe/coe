/* Account menu: the picture button and the menu that opens from it, like the one Google has. One file, no dependencies.
   The site gives it the signed-in person and says what each button does; this file only draws it and handles keys and focus.

   A picture button:   PmcAccount.mount(element, function () { return options; })   (the element must be empty)
   Any button of your own (a sidebar footer, say):   PmcAccount.toggle(button, function () { return options; })

   options = {
     user:   { name, email, img } or null when nobody is signed in   (img is optional: a picture address or a data: picture)
     others: [ { id, name, email, img } ]    the other accounts added on this device (leave out for none)
     manage: 'https://accounts.pmcstudios.uk/'       where "Manage your PMC Account" goes
     privacy: 'https://accounts.pmcstudios.uk/privacy/'   the Privacy link at the bottom (left out: that address)
          onSettings(), onPicture(), onSignIn(), onAddAccount(), onSwitch(account), onSignOut()    a button shows only when its function is given
   }

   Other accounts: PmcAccount.remember(user) keeps a name, an email and a tiny picture for each account used on this device (no passwords, no keys),
   PmcAccount.others(email) lists the rest, PmcAccount.forget(email) takes one off. Each site keeps its own list. */
(function () {
  if (window.PmcAccount) return;
  var S = 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter"';
  var ICON = {
    user: '<svg viewBox="0 0 24 24" width="24" height="24" ' + S + ' aria-hidden="true"><path d="M8 4h8v8H8zM4 21v-3h16v3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="20" height="20" ' + S + ' aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="20" height="20" ' + S + ' aria-hidden="true"><path d="M10 3h4v3l2.2 1.3L19 5.8l2 3.4-2.8 1.5v2.6l2.8 1.5-2 3.4-2.8-1.5L14 18v3h-4v-3l-2.2-1.3L5 18.2l-2-3.4 2.8-1.5v-2.6L3 9.2l2-3.4 2.8 1.5L10 6z"/><path d="M10 10h4v4h-4z"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="16" height="16" ' + S + ' aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>',
    out: '<svg viewBox="0 0 24 24" width="20" height="20" ' + S + ' aria-hidden="true"><path d="M10 4H4v16h6M9 12h12M16 7l5 5-5 5"/></svg>',
    pen: '<svg viewBox="0 0 24 24" width="14" height="14" ' + S + ' aria-hidden="true"><path d="M4 20l1-5L16 4l4 4L9 19zM13 7l4 4"/></svg>',
    down: '<svg viewBox="0 0 24 24" width="20" height="20" ' + S + ' aria-hidden="true"><path d="M5 9l7 7 7-7"/></svg>',
  };
  var CSS = '.pa-btn{display:inline-grid;place-items:center;width:var(--pa-size,40px);height:var(--pa-size,40px);padding:0;margin:0;overflow:hidden;background:var(--pa-bg,#337957);color:var(--pa-fg,#F2E4CE);border:var(--pa-frame,3px) solid var(--pa-ring,#171717);border-radius:0;cursor:pointer;box-shadow:var(--pa-shadow,none);font-family:var(--d,"PMC Header","Shoulders","Arial Narrow",Impact,sans-serif);font-size:calc(var(--pa-size,40px) * .5);line-height:1;text-transform:uppercase;font-synthesis:none;transition:box-shadow .1s,transform .1s;-webkit-tap-highlight-color:transparent}'
    + '.pa-btn:hover,.pa-btn[aria-expanded="true"]{box-shadow:var(--pa-shadow-hover,0 0 0 3px var(--pa-ring,#171717))}'
    + '.pa-btn:focus-visible{outline:4px solid #337957;outline-offset:3px}'
    + '.pa-btn img,.pa-i img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.pa-pop{position:fixed;z-index:2147483000;width:min(364px,calc(100vw - 16px));max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);overflow:auto;overscroll-behavior:contain;box-sizing:border-box;padding:10px;background:#F2E4CE;color:#171717;border:3px solid #171717;box-shadow:8px 8px 0 #1A4934;font-family:var(--t,"PMC Font","Plex","Courier New",monospace);font-synthesis:none;-webkit-font-smoothing:antialiased;line-height:1.25;animation:paup .18s cubic-bezier(.16,1,.3,1) backwards}'
    + '.pa-pop[hidden]{display:none}'
    + '.pa-d{font-family:var(--d,"PMC Header","Shoulders","Arial Narrow",Impact,sans-serif);text-transform:uppercase;font-weight:400;letter-spacing:.03em;line-height:.95}'
    + '.pa-top{display:flex;align-items:center;justify-content:flex-end;margin:0 0 8px}'
    + '.pa-close{display:grid;place-items:center;flex:none;width:34px;height:34px;margin:0;padding:0;background:transparent;color:#171717;border:3px solid #171717;border-radius:0;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .1s,color .1s}'
    + '.pa-close:hover,.pa-close:focus-visible{background:#171717;color:#F2E4CE;outline:none}'
    + '.pa-close:focus-visible{box-shadow:0 0 0 3px #337957}'
    + '.pa-card{position:relative;box-sizing:border-box;margin:0 0 8px;background:#FBF6EC;border:3px solid #171717}'
    + '.pa-card[hidden]{display:none}'
    + '.pa-hd{display:flex;align-items:center;flex-wrap:wrap;gap:14px;padding:16px;overflow:hidden;background:#337957;color:#F2E4CE}'
    + '.pa-dots{position:absolute;top:0;right:0;bottom:0;width:60%;pointer-events:none;color:#6FB894}'
    + '.pa-dots i{position:absolute;inset:0}'
    + '.pa-dots i:nth-child(1){background:radial-gradient(circle at center,currentColor 0 2.6px,transparent 3px) 0 0/12px 12px;-webkit-mask-image:linear-gradient(90deg,transparent 0,transparent 55%,#000 100%);mask-image:linear-gradient(90deg,transparent 0,transparent 55%,#000 100%)}'
    + '.pa-dots i:nth-child(2){background:radial-gradient(circle at center,currentColor 0 1.8px,transparent 2.2px) 0 0/12px 12px;-webkit-mask-image:linear-gradient(90deg,transparent 0,transparent 25%,#000 55%,transparent 80%);mask-image:linear-gradient(90deg,transparent 0,transparent 25%,#000 55%,transparent 80%)}'
    + '.pa-dots i:nth-child(3){background:radial-gradient(circle at center,currentColor 0 1px,transparent 1.4px) 0 0/12px 12px;-webkit-mask-image:linear-gradient(90deg,#000 0,transparent 55%);mask-image:linear-gradient(90deg,#000 0,transparent 55%)}'
    + '.pa-hd>*:not(.pa-dots){position:relative}'
    + '.pa-avw{position:relative;flex:none}'
    + '.pa-av{display:grid;place-items:center;overflow:hidden;width:64px;height:64px;background:#B49A57;color:#171717;border:3px solid #171717;box-shadow:4px 4px 0 #1A4934;font-size:2.3rem;line-height:1}'
    + '.pa-av img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.pa-edit{position:absolute;right:-9px;bottom:-9px;display:grid;place-items:center;width:26px;height:26px;margin:0;padding:0;background:#171717;color:#F2E4CE;border:2px solid #F2E4CE;border-radius:0;cursor:pointer;-webkit-tap-highlight-color:transparent}'
    + '.pa-edit:hover,.pa-edit:focus-visible{background:#F2E4CE;color:#171717;border-color:#171717;outline:none}'
    + '.pa-who{display:grid;gap:5px;min-width:0;flex:1}'
    + '.pa-name{font-size:1.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.pa-mail{font-size:.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.pa-sub{font-size:.95rem;line-height:1.3}'
    + '.pa-fold{display:grid;place-items:center;flex:none;width:38px;height:38px;margin:0;padding:0;background:#F2E4CE;color:#171717;border:3px solid #171717;border-radius:0;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .1s,color .1s}'
    + '.pa-fold svg{transition:transform .2s cubic-bezier(.16,1,.3,1)}'
    + '.pa-fold[aria-expanded="true"] svg{transform:rotate(180deg)}'
    + '.pa-fold:hover,.pa-fold:focus-visible{background:#171717;color:#F2E4CE;outline:none}'
    + '.pa-list{list-style:none;margin:0;padding:0}'
    + '.pa-list>li+li{border-top:2px solid #CDBB98}'
    + '.pa-row{display:flex;align-items:center;gap:12px;box-sizing:border-box;width:100%;min-height:54px;padding:8px 14px;margin:0;background:transparent;color:#171717;border:0;border-radius:0;text-align:left;text-decoration:none;font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .1s,color .1s}'
    + '.pa-row:hover,.pa-row:focus-visible{background:#D5E8DC;outline:none}'
    + '.pa-row:focus-visible{box-shadow:inset 0 0 0 3px #337957}'
    + '.pa-row.pa-red{color:#B3261E}'
    + '.pa-row.pa-red:hover,.pa-row.pa-red:focus-visible{background:#B3261E;color:#F2E4CE}'
    + '.pa-row.pa-red:focus-visible{box-shadow:inset 0 0 0 3px #F2E4CE}'
    + '.pa-rw{display:flex;align-items:stretch}.pa-rw .pa-row{flex:1;min-width:0}'
    + '.pa-x{flex:none;display:grid;place-items:center;width:46px;margin:0;padding:0;background:transparent;color:#171717;opacity:.55;border:0;border-left:2px solid #CDBB98;border-radius:0;cursor:pointer}'
    + '.pa-x:hover,.pa-x:focus-visible{background:#171717;color:#F2E4CE;opacity:1;outline:none}'
    + '.pa-i{display:grid;place-items:center;flex:none;overflow:hidden;width:36px;height:36px;background:#337957;color:#F2E4CE;border:2px solid #171717;font-size:1.3rem;line-height:1}'
    + '.pa-i img{width:100%;height:100%;object-fit:cover;display:block}'
    + '.pa-i.pa-ic{width:24px;height:auto;background:transparent;color:inherit;border:0;overflow:visible}'
    + '.pa-t{display:grid;gap:3px;min-width:0;flex:1}'
    + '.pa-t b{font-weight:400;font-size:1.2rem;line-height:1.05}'
    + '.pa-t span{font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.pa-manage{display:flex;align-items:center;gap:12px;box-sizing:border-box;width:100%;min-height:54px;padding:8px 14px;margin:0;background:transparent;color:#171717;border:0;border-radius:0;text-decoration:none;cursor:pointer;transition:background .1s,color .1s;-webkit-tap-highlight-color:transparent}'
    + '.pa-manage:hover,.pa-manage:focus-visible{background:#D5E8DC;outline:none}'
    + '.pa-manage:focus-visible{box-shadow:inset 0 0 0 3px #337957}'
    + '.pa-manage.pa-solid{justify-content:center;min-height:46px;padding:6px 14px;background:#171717;color:#F2E4CE;border:3px solid #171717;font-family:var(--d,"PMC Header","Shoulders","Arial Narrow",Impact,sans-serif);text-transform:uppercase;font-size:1.3rem;letter-spacing:.03em;line-height:1}'
    + '.pa-manage.pa-solid:hover,.pa-manage.pa-solid:focus-visible{background:#F2E4CE;color:#171717}'
    + '.pa-hd .pa-manage.pa-solid{flex:1 1 100%;width:auto}'
    + '.pa-foot{display:flex;align-items:center;justify-content:center;gap:10px;margin:10px 0 2px;font-size:.78rem}'
    + '.pa-foot a{color:#171717;text-decoration:underline;text-underline-offset:3px}'
    + '.pa-foot a:hover,.pa-foot a:focus-visible{background:#171717;color:#F2E4CE;text-decoration:none;outline:none}'
    + '.pa-scrim{position:fixed;inset:0;z-index:2147482999;overflow:hidden;background:rgba(23,23,23,.46);opacity:0;transition:opacity .3s cubic-bezier(.7,0,.2,1)}'
    + '.pa-scrim.pa-in{opacity:1}'
    + '.pa-orb{position:absolute;left:var(--pa-x,50%);top:var(--pa-y,50%);width:min(104vmax,1000px);height:min(104vmax,1000px);margin:calc(min(104vmax,1000px)/-2) 0 0 calc(min(104vmax,1000px)/-2);opacity:0;transition:opacity .55s cubic-bezier(.16,1,.3,1)}'
    + '.pa-orb i{position:absolute;inset:0;color:#FBF6EC}'
    + '.pa-orb i:nth-child(1){background:radial-gradient(circle at center,currentColor 0 4.2px,transparent 4.5px) 0 0/14px 14px;-webkit-mask-image:radial-gradient(circle closest-side,#000 0 7%,transparent 17%);mask-image:radial-gradient(circle closest-side,#000 0 7%,transparent 17%)}'
    + '.pa-orb i:nth-child(2){background:radial-gradient(circle at center,currentColor 0 3.2px,transparent 3.5px) 0 0/14px 14px;-webkit-mask-image:radial-gradient(circle closest-side,transparent 0 7%,#000 17%,transparent 29%);mask-image:radial-gradient(circle closest-side,transparent 0 7%,#000 17%,transparent 29%)}'
    + '.pa-orb i:nth-child(3){background:radial-gradient(circle at center,currentColor 0 2.3px,transparent 2.6px) 0 0/14px 14px;-webkit-mask-image:radial-gradient(circle closest-side,transparent 0 17%,#000 28%,transparent 42%);mask-image:radial-gradient(circle closest-side,transparent 0 17%,#000 28%,transparent 42%)}'
    + '.pa-orb i:nth-child(4){background:radial-gradient(circle at center,currentColor 0 1.5px,transparent 1.8px) 0 0/14px 14px;-webkit-mask-image:radial-gradient(circle closest-side,transparent 0 28%,#000 40%,transparent 56%);mask-image:radial-gradient(circle closest-side,transparent 0 28%,#000 40%,transparent 56%)}'
    + '.pa-orb i:nth-child(5){background:radial-gradient(circle at center,currentColor 0 0.9px,transparent 1.2px) 0 0/14px 14px;-webkit-mask-image:radial-gradient(circle closest-side,transparent 0 40%,#000 52%,transparent 74%);mask-image:radial-gradient(circle closest-side,transparent 0 40%,#000 52%,transparent 74%)}'
    + '.pa-scrim.pa-in .pa-orb{opacity:.52}'
    + '.pa-pop{transition:opacity .2s cubic-bezier(.7,0,.2,1),transform .2s cubic-bezier(.7,0,.2,1)}'
    + '.pa-pop.pa-out{opacity:0;transform:translateY(6px);pointer-events:none}'
    + '.pa-scrim.pa-out{opacity:0;pointer-events:none;transition-duration:.22s}'
    + '@keyframes paup{from{opacity:0;transform:translateY(8px) scale(.98)}}'
    + '@media (max-width:480px){.pa-pop{left:8px!important;right:8px!important;top:auto!important;bottom:8px!important;width:auto;max-height:calc(100dvh - 24px)}}'
    + '@media (prefers-reduced-motion:reduce){.pa-pop,.pa-scrim,.pa-orb{animation:none;transition:none}.pa-manage,.pa-row,.pa-fold svg{transition:none}}';

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
  var REDUCED = false; try { REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* no media queries */ }
  /* The rest of the screen fades dark, with a light orb growing out of the middle of the menu. Both fade back out when it closes. */
  function fadeOut(o) {
    var gone = function () { o.pop.remove(); if (o.scrim) o.scrim.remove(); };
    if (REDUCED) { gone(); return; }
    o.pop.classList.add('pa-out'); o.pop.setAttribute('aria-hidden', 'true'); if (o.scrim) o.scrim.classList.add('pa-out');
    setTimeout(gone, 260);
  }
  function close(focusBack) {
    if (!open) return; var o = open; open = null;
    o.anchor.setAttribute('aria-expanded', 'false'); fadeOut(o);
    document.removeEventListener('mousedown', o.onDown, true); document.removeEventListener('keydown', o.onKey, true); removeEventListener('resize', o.onResize); removeEventListener('scroll', o.onResize, true);
    if (focusBack) o.anchor.focus();
  }
  function place(o) {
    var r = o.anchor.getBoundingClientRect(), w = o.pop.offsetWidth, h = o.pop.offsetHeight, m = 8, gap = 10;
    var left = r.left + r.width / 2 < innerWidth / 2 ? r.left : r.right - w;
    left = Math.min(Math.max(m, left), innerWidth - w - m);
    var below = innerHeight - r.bottom - gap - m, above = r.top - gap - m, top;
    if (h <= below || below >= above) top = r.bottom + gap; else top = r.top - gap - h;
    top = Math.min(Math.max(m, top), Math.max(m, innerHeight - h - m));
    o.pop.style.left = left + 'px'; o.pop.style.top = top + 'px';
    if (o.scrim) { o.scrim.style.setProperty('--pa-x', Math.round(left + w / 2) + 'px'); o.scrim.style.setProperty('--pa-y', Math.round(top + h / 2) + 'px'); }
  }
  function build(op) {
    var u = op.user, h = '', dots = '<span class="pa-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
    var others = (op.others || []), manage = esc(op.manage || 'https://accounts.pmcstudios.uk/');
    h += '<div class="pa-top"><button type="button" class="pa-close" data-pa="close" aria-label="Close" title="Close">' + ICON.x.replace('width="16" height="16"', 'width="18" height="18"') + '</button></div>';
    if (u) {
      h += '<div class="pa-card pa-hd">' + dots
        + '<span class="pa-avw"><span class="pa-av pa-d">' + pic(u) + '</span>' + (op.onPicture ? '<button type="button" class="pa-edit" data-pa="picture" aria-label="Change your picture" title="Change your picture">' + ICON.pen + '</button>' : '') + '</span>'
        + '<span class="pa-who"><b class="pa-name pa-d">' + esc(first(u)) + '</b>' + (u.email ? '<span class="pa-mail">' + esc(u.email) + '</span>' : '') + '</span>'
        + (others.length || op.onAddAccount ? '<button type="button" class="pa-fold" data-pa="fold" aria-expanded="true" aria-label="Show or hide your accounts" title="Your accounts">' + ICON.down + '</button>' : '')
        + '</div>';
    } else {
      h += '<div class="pa-card pa-hd pa-out">' + dots
        + '<span class="pa-avw"><span class="pa-av pa-d">' + ICON.user.replace('width="24" height="24"', 'width="34" height="34"') + '</span></span>'
        + '<span class="pa-who"><span class="pa-sub">One PMC Account for every PMC site.</span></span>'
        + (op.onSignIn ? '<button type="button" class="pa-manage pa-solid" data-pa="signin">Sign in</button>' : '<a class="pa-manage pa-solid" data-pa="manage" href="' + manage + '"' + TGT + '>Sign in</a>')
        + '</div>';
    }
    var rows = [], i, a;
    for (i = 0; i < others.length; i++) {
      a = others[i];
      rows.push('<div class="pa-rw"><button type="button" class="pa-row" data-pa="switch" data-i="' + i + '"><span class="pa-i pa-d">' + pic(a) + '</span><span class="pa-t"><b class="pa-d">' + esc(first(a)) + '</b><span>' + esc(a.email || '') + '</span></span></button>'
        + '<button type="button" class="pa-x" data-pa="forget" data-i="' + i + '" aria-label="Remove ' + esc(a.email || first(a)) + ' from this device" title="Remove from this device">' + ICON.x + '</button></div>');
    }
    if (u && op.onAddAccount) rows.push('<button type="button" class="pa-row" data-pa="add"><span class="pa-i pa-ic">' + ICON.plus + '</span><span class="pa-t"><b class="pa-d">Add another account</b></span></button>');
    if (u && op.onSignOut) rows.push('<button type="button" class="pa-row pa-red" data-pa="out"><span class="pa-i pa-ic">' + ICON.out + '</span><span class="pa-t"><b class="pa-d">Sign out</b></span></button>');
    if (rows.length) h += '<div class="pa-card pa-acc"><ul class="pa-list">' + rows.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul></div>';
    if (u) h += '<div class="pa-card"><a class="pa-manage" data-pa="manage" href="' + manage + '"' + TGT + '><span class="pa-i pa-ic">' + ICON.user.replace('width="24" height="24"', 'width="22" height="22"') + '</span><span class="pa-t"><b class="pa-d">Manage your PMC Account</b></span></a></div>';
    if (op.onSettings) h += '<div class="pa-card"><button type="button" class="pa-row" data-pa="settings"><span class="pa-i pa-ic">' + ICON.gear + '</span><span class="pa-t"><b class="pa-d">Settings</b></span></button></div>';
    h += '<div class="pa-foot"><a href="' + esc(op.privacy || 'https://accounts.pmcstudios.uk/privacy/') + '"' + TGT + ' data-pa="privacy">Privacy</a></div>';
    return h;
  }
  function toggle(anchor, get, byKey) {
    if (!anchor) return; css();
    if (open && open.anchor === anchor) { close(false); return; }
    close(false);
    var op = (typeof get === 'function' ? get() : get) || {};
    var pop = document.createElement('div'); pop.className = 'pa-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Account menu');
    pop.innerHTML = build(op);
    var scrim = document.createElement('div'); scrim.className = 'pa-scrim'; scrim.setAttribute('aria-hidden', 'true'); scrim.innerHTML = '<span class="pa-orb"><i></i><i></i><i></i><i></i><i></i></span>';
    scrim.addEventListener('mousedown', function (e) { e.preventDefault(); });
    document.body.appendChild(scrim); document.body.appendChild(pop); anchor.setAttribute('aria-expanded', 'true');
    var o = { anchor: anchor, pop: pop, scrim: scrim }; open = o; place(o);
    void scrim.offsetWidth; scrim.classList.add('pa-in');
    o.onDown = function (e) { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(false); };
    o.onKey = function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(true); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        var t = Array.prototype.slice.call(pop.querySelectorAll('.pa-fold,.pa-manage,.pa-row,.pa-x')), i = t.indexOf(document.activeElement);
        e.preventDefault(); var n = i < 0 ? 0 : e.key === 'ArrowDown' ? Math.min(t.length - 1, i + 1) : Math.max(0, i - 1); t[n] && t[n].focus();
      }
    };
    o.onResize = function () { place(o); };
    pop.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-pa]'); if (!b || !pop.contains(b)) return;
      var k = b.getAttribute('data-pa');
      if (k === 'manage') { if (op.onManage) { e.preventDefault(); close(false); op.onManage(); } else close(false); return; }
      if (k === 'privacy') { close(false); return; }
      if (k === 'close') { close(true); return; }
      if (k === 'fold') {
        var acc = pop.querySelector('.pa-acc'); if (!acc) return;
        var show = acc.hidden; acc.hidden = !show; b.setAttribute('aria-expanded', String(show)); place(o); return;
      }
      if (k === 'forget') {
        var ac = (op.others || [])[+b.getAttribute('data-i')]; if (!ac) return;
        if (op.onForget) op.onForget(ac); else forget(ac.email);
        op.others = (op.others || []).filter(function (x) { return x !== ac; });
        var li = b.closest('li'); if (li) li.remove(); var lst = pop.querySelector('.pa-list'); if (lst && !lst.children.length) { var cd = lst.closest('.pa-card'); if (cd) cd.remove(); } place(o); return;
      }
      close(false);
      if (k === 'signin' && op.onSignIn) op.onSignIn();
      else if (k === 'add' && op.onAddAccount) op.onAddAccount();
      else if (k === 'settings' && op.onSettings) op.onSettings();
      else if (k === 'picture' && op.onPicture) op.onPicture();
      else if (k === 'out' && op.onSignOut) op.onSignOut();
      else if (k === 'switch' && op.onSwitch) op.onSwitch((op.others || [])[+b.getAttribute('data-i')]);
    });
    document.addEventListener('mousedown', o.onDown, true); document.addEventListener('keydown', o.onKey, true); addEventListener('resize', o.onResize); addEventListener('scroll', o.onResize, true);
    if (byKey) { var f = pop.querySelector('.pa-fold,.pa-manage,.pa-row'); f && f.focus(); }
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
