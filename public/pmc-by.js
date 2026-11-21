/* By PMC: the apps button and menu, like the one Google has. One file, no dependencies.
   It is in the account menu's style: the same frame and shadow, a bordered grid that turns black when you point at a cell, and Privacy and Terms underneath.
   Static site:  <span data-pmc-by></span> + <script src="pmc-by.js" defer></script>
   React or any app:  PmcBy.mount(element)  (the element must be empty; React must not render children in it),
   or PmcBy.attach(button, true) to use a button the site already has.
   A site that does not allow inline styles links css/pmc-menus.css (made by build-css.mjs) with the attribute data-pmc-menus instead.
   PmcScroll.open(menu, button) / PmcScroll.shut(menu, done, button) is the scroll the menus open with (out of their button, with a halftone edge); the help menus use it too.
   The list lives in SITES below. Change it here and copy this file to every PMC site. */
(function () {
  if (window.PmcBy) return;
  var SITES = [
    { id: 'studio', name: 'Studios', host: 'pmcstudios.uk', url: 'https://pmcstudios.uk/', icon: 'pmc', bg: '#171717', fg: '#FBF6EC' },
    { id: 'tools', name: 'Tools', host: 'tools.pmcstudios.uk', url: 'https://tools.pmcstudios.uk/', icon: 'tools', bg: '#B49A57', fg: '#171717' },
    { id: 'coe', name: 'Coe', host: 'coe.pmcstudios.uk', url: 'https://coe.pmcstudios.uk/', icon: 'star', bg: '#FBF6EC', fg: '#337957' },
    { id: 'mini', name: 'Coe Mini', host: '', note: 'Browser extension', url: 'https://coe.pmcstudios.uk/about/', icon: 'mini', bg: '#337957', fg: '#FBF6EC' },
    { id: 'account', name: 'ID', host: 'id.pmcstudios.uk', url: 'https://id.pmcstudios.uk/', icon: 'user', bg: '#1A4934', fg: '#FBF6EC' }
  ];
  var STAR = 'M786.886 22.9033C790.107 14.1976 802.421 14.1978 805.643 22.9033L825.213 75.79C875.855 212.649 983.761 320.556 1120.62 371.198L1173.51 390.768C1182.21 393.989 1182.21 406.304 1173.51 409.525L1120.62 429.095C983.761 479.737 875.855 587.643 825.213 724.503L805.643 777.39C802.421 786.095 790.107 786.095 786.886 777.39L767.316 724.503C716.674 587.643 608.768 479.737 471.908 429.095L419.021 409.525C410.316 406.304 410.316 393.989 419.021 390.768L471.908 371.198C608.768 320.556 716.674 212.65 767.316 75.79L786.886 22.9033ZM796.265 272.595C726.494 272.595 669.934 329.155 669.934 398.926C669.934 468.696 726.494 525.257 796.265 525.257C866.035 525.257 922.595 468.696 922.596 398.926C922.596 329.155 866.035 272.595 796.265 272.595Z', PMC = 'M1264.16 741.211L1516.85 3.66211H1741.7V1190.81H1742.03V1281.33H2527.92V1453.42H1569.94V1190.81H1570.31V395.508L1285.4 1192.38L1263.43 1251.96L1241.46 1192.38L958.008 409.424V1192.38H957.979V1453.42H0V1281.33H785.889V3.66211H1012.94L1264.16 741.211Z M2221.44 0C2227.29 0 2233.4 0.244141 2239.75 0.732422C2256.84 0.732422 2274.66 1.70898 2293.21 3.66211C2423.1 26.6113 2516.11 118.652 2572.27 279.785L2581.05 323.73L2419.19 367.676C2387.94 279.297 2348.63 220.947 2301.27 192.627C2254.39 163.818 2205.08 163.086 2153.32 190.43C2109.38 217.773 2076.9 259.033 2055.91 314.209C2035.4 368.896 2025.15 458.008 2025.15 581.543C2020.26 659.668 2025.63 737.793 2041.26 815.918C2056.88 894.043 2084.47 949.219 2124.02 981.445C2164.06 1013.18 2216.55 1022.22 2281.49 1008.54C2340.58 985.596 2386.23 926.27 2418.46 830.566L2581.05 878.174C2556.15 977.783 2503.17 1064.94 2422.12 1139.65C2369.87 1177.73 2305.91 1196.78 2230.22 1196.78C2220.95 1197.75 2211.91 1198.24 2203.12 1198.24H2189.21C2073.97 1192.87 1984.86 1129.15 1921.88 1007.08C1876.46 929.443 1852.05 791.504 1848.63 593.262C1848.14 580.078 1847.9 566.895 1847.9 553.711C1848.88 384.766 1875.24 256.104 1927 167.725C1976.81 91.5527 2034.42 43.2129 2099.85 22.7051C2137.94 7.56836 2178.47 0 2221.44 0Z M292.969 4.39453C387.695 4.39453 466.309 27.5879 528.809 73.9746C627.93 146.729 682.861 242.432 693.604 361.084C695.557 382.568 696.533 403.32 696.533 423.34C696.533 528.32 669.678 611.328 615.967 672.363C540.283 766.602 434.57 819.336 298.828 830.566H174.316V1191.65H0.732422L0 4.39453H292.969ZM437.988 220.459C387.695 181.885 336.426 165.283 284.18 170.654H175.049V656.25H292.236C366.943 657.227 426.758 629.15 471.68 572.021C517.09 514.893 534.912 451.172 525.146 380.859C517.334 312.012 488.281 258.545 437.988 220.459Z';
  var S = 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter"';
  /* Pictures for the list, drawn to sit in a 50px box with even margins (so they land on whole pixels). */
  var ICON = {
    pmc: '<svg viewBox="0 0 2582 1454" width="38" height="22" fill="currentColor" aria-hidden="true"><path d="' + PMC + '"/></svg>',
    star: '<svg viewBox="405 10 782 782" width="34" height="34" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="' + STAR + '"/></svg>',
    tools: '<svg viewBox="0 0 24 24" width="32" height="32" ' + S + ' aria-hidden="true"><path d="M16.2 3.3 A5.6 5.6 0 0 0 13 14 L6.5 20.5 L3.5 17.5 L10 11 A5.6 5.6 0 0 0 20.7 7.8"/></svg>',
    mini: '<svg viewBox="405 10 782 782" width="24" height="24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="' + STAR + '"/></svg>',
    user: '<svg viewBox="0 0 24 24" width="32" height="32" ' + S + ' aria-hidden="true"><path d="M8 4h8v8H8zM4 21v-3h16v3"/></svg>'
  };
  var X = '<svg viewBox="0 0 24 24" width="20" height="20" ' + S + ' aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>';
  var HEAD = '"PMC Symbols L2","PMC Header","Shoulders","Arial Narrow",Impact,sans-serif', BODY = '"PMC Symbols L4 Upright","PMC Font Upright","PMC Font","Plex","Courier New",monospace';

  /* The scroll: a menu opens out of the button it belongs to (down from a button at the top, up from one at the bottom), wiped open behind an edge of comic-book halftone dots that thin out as it lands,
     and wiped shut the same way. PmcScroll.open(menu, button) / PmcScroll.shut(menu, done, button); leave the button out and it is worked out from where the menu sits.
     One copy of this also sits in pmc-by.js / pmc-account.js; whichever file loads first provides window.PmcScroll. */
  var SCROLL_CSS = '.pm-roll{position:absolute;left:0;right:0;top:0;height:52px;z-index:9;pointer-events:none;color:#171717;will-change:transform,opacity}'
    + '.pm-roll i{position:absolute;left:0;right:0;bottom:0;display:block}'
    + '.pm-roll i:nth-child(1){height:5px;background:#171717}'
    + '.pm-roll i:nth-child(2){top:0;background:radial-gradient(circle at center,currentColor 0 3.6px,transparent 4px) 0 0/11px 11px;-webkit-mask-image:linear-gradient(0deg,transparent 0,transparent 5px,#000 8px,#000 14px,transparent 22px);mask-image:linear-gradient(0deg,transparent 0,transparent 5px,#000 8px,#000 14px,transparent 22px)}'
    + '.pm-roll i:nth-child(3){top:0;color:#337957;background:radial-gradient(circle at center,currentColor 0 2.5px,transparent 2.9px) 0 0/11px 11px;-webkit-mask-image:linear-gradient(0deg,transparent 0,transparent 14px,#000 24px,#000 30px,transparent 38px);mask-image:linear-gradient(0deg,transparent 0,transparent 14px,#000 24px,#000 30px,transparent 38px)}'
    + '.pm-roll i:nth-child(4){top:0;color:#337957;background:radial-gradient(circle at center,currentColor 0 1.3px,transparent 1.7px) 0 0/11px 11px;-webkit-mask-image:linear-gradient(0deg,transparent 0,transparent 30px,#000 40px,transparent 52px);mask-image:linear-gradient(0deg,transparent 0,transparent 30px,#000 40px,transparent 52px)}';
  if (!window.PmcScroll) window.PmcScroll = (function () {
    var BAND = 52, PAD = 14;
    function calm() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
    function stop(el) {
      var s = el._pm; if (!s) return; el._pm = null; if (s.raf) cancelAnimationFrame(s.raf);
      if (s.bar.parentNode) s.bar.parentNode.removeChild(s.bar);
      el.style.overflow = s.overflow; el.style.clipPath = s.clip;
    }
    /* t: 0 = shut, 1 = open. The menu is cut to a window that grows out of the button; the dot edge rides on the window's moving side. */
    function draw(el, s) {
      var t = s.t, cut = s.h * (1 - t), wi = Math.max(0, 1 - t * 2.2);
      var l = s.ox * wi, r = (s.w - s.ox) * wi - PAD * (1 - wi);
      var top = s.up ? cut : 0, bot = s.up ? -PAD * t : cut - PAD * t;
      el.style.clipPath = 'inset(' + top.toFixed(1) + 'px ' + r.toFixed(1) + 'px ' + bot.toFixed(1) + 'px ' + l.toFixed(1) + 'px)';
      s.bar.style.transform = s.up ? 'translateY(' + cut.toFixed(1) + 'px) scaleY(-1)' : 'translateY(' + (s.h - cut - BAND).toFixed(1) + 'px)';
      s.bar.style.opacity = String(Math.max(0, Math.min(1, t * 14, (1 - t) * 5)));
    }
    function tick(el) {
      var s = el._pm; if (!s) return;
      var p = Math.min(1, (performance.now() - s.t0) / s.dur), k = s.to === 1 ? 1 - Math.pow(1 - p, 4) : p * p * p;
      s.t = s.from + (s.to - s.from) * k; draw(el, s);
      if (p < 1) { s.raf = requestAnimationFrame(function () { tick(el); }); return; }
      var done = s.done; stop(el); if (done) done();
    }
    function go(el, opening, done, from) {
      if (!el || !window.requestAnimationFrame || calm() || !el.offsetHeight) { if (done) done(); return; }
      if (from) el._pmFrom = from; else from = el._pmFrom || el.previousElementSibling;
      var s = el._pm;
      if (!s) {
        var er = el.getBoundingClientRect(), up = false, ox = er.width / 2;
        if (from && from.getBoundingClientRect) { var ar = from.getBoundingClientRect(); up = er.top + er.height / 2 < ar.top + ar.height / 2; ox = Math.max(0, Math.min(er.width, ar.left + ar.width / 2 - er.left)); }
        var bar = document.createElement('i'); bar.className = 'pm-roll'; bar.setAttribute('aria-hidden', 'true'); bar.innerHTML = '<i></i><i></i><i></i><i></i>';
        s = el._pm = { bar: bar, h: el.offsetHeight, w: el.offsetWidth, up: up, ox: ox, t: opening ? 0 : 1, overflow: el.style.overflow, clip: el.style.clipPath };
        el.style.overflow = 'hidden'; el.appendChild(bar); draw(el, s);
      }
      s.from = s.t; s.to = opening ? 1 : 0; s.done = done; s.t0 = performance.now();
      s.dur = Math.max(140, (opening ? 560 : 300) * Math.abs(s.to - s.from));
      if (s.raf) cancelAnimationFrame(s.raf); s.raf = requestAnimationFrame(function () { tick(el); });
    }
    return { open: function (el, from) { go(el, true, null, from); }, shut: function (el, done, from) { go(el, false, done, from); }, css: SCROLL_CSS };
  })();
  var PS = window.PmcScroll;

  var CSS = '.pb-btn{display:inline-grid;place-items:center;width:var(--pb-size,40px);height:var(--pb-size,40px);padding:0;margin:0;background:var(--pb-bg,transparent);color:var(--pb-fg,currentColor);border:var(--pb-frame,3px) solid currentColor;border-radius:0;cursor:pointer;box-shadow:var(--pb-shadow,none);transition:background .1s,color .1s,box-shadow .1s;font:inherit;-webkit-tap-highlight-color:transparent}'
    + '.pb-btn:hover,.pb-btn[aria-expanded="true"]{background:var(--pb-hover-bg,#171717);color:var(--pb-hover-fg,#FBF6EC)}'
    + '.pb-btn:focus-visible{outline:none;box-shadow:5px 5px 0 #337957}'
    + '.pb-dots{display:grid;grid-template-columns:repeat(3,6px);gap:3px}.pb-dots i{width:6px;height:6px;background:currentColor;display:block}'
    /* the menu */
    + '.pb-pop{--bi:var(--pb-ink,#171717);--bp:var(--pb-paper,#FBF6EC);--bs:var(--pb-shadow,#1A4934);--ba:var(--pb-accent,#337957);--bh:var(--pb-head,' + HEAD + ');--bf:var(--pb-font,' + BODY + ');'
    + 'position:fixed;z-index:2147483000;width:min(380px,calc(100vw - 16px));max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);overflow:auto;overscroll-behavior:contain;box-sizing:border-box;background:var(--bp);color:var(--bi);border:3px solid var(--bi);box-shadow:8px 8px 0 var(--bs);font:400 14px/1.35 var(--bf);font-synthesis:none;-webkit-font-smoothing:antialiased;text-transform:none;letter-spacing:0}'
    + '.pb-pop[hidden]{display:none}.pb-pop :focus-visible{outline:none}.pb-pop *{box-sizing:border-box}'
    + '.pb-in{padding:10px}'
    /* the grid: a bordered group like the account menu's, cells divided by the same 3px line */
    + '.pb-grp{display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:1fr;gap:3px;margin:0;padding:0;list-style:none;border:3px solid var(--bi);background:var(--bi);overflow:hidden}'
    + '.pb-grp>li{display:grid;background:var(--bp);min-width:0}'
    + '.pb-t{display:grid;justify-items:center;align-content:start;gap:10px;padding:16px 4px 14px;color:inherit;text-decoration:none;text-align:center;cursor:pointer;-webkit-tap-highlight-color:transparent}'
    + '.pb-t:hover,.pb-t:focus-visible{background:var(--bi);color:var(--bp)}'
    + '.pb-t[aria-current="true"]{background:#D5E8DC}.pb-t[aria-current="true"]:hover,.pb-t[aria-current="true"]:focus-visible{background:var(--bi)}'
    + '.pb-i{display:grid;place-items:center;width:56px;height:56px;border:3px solid var(--bi);transition:border-color .1s}'
    + '.pb-t:hover .pb-i,.pb-t:focus-visible .pb-i{border-color:var(--bp)}'
    + '.pb-name{font:400 22px/.95 var(--bh);text-transform:uppercase;letter-spacing:.03em}'
    + '.pb-here{display:block;margin-top:-4px;font-size:11.5px;line-height:1.2;font-weight:700;color:var(--ba)}.pb-t:hover .pb-here,.pb-t:focus-visible .pb-here{color:#6FB894}'
    /* the empty cell is filled with the halftone dots the account card has, so the grid ends square */
    + '.pb-fill{position:relative;overflow:hidden;background:var(--bp);color:#A9CDB9}'
    + '.pb-ht{position:absolute;inset:0;pointer-events:none}.pb-ht i{position:absolute;inset:0}'
    + '.pb-ht i:nth-child(1){background:radial-gradient(circle at center,currentColor 0 3px,transparent 3.2px) 0 0/11px 11px;-webkit-mask-image:radial-gradient(circle farthest-corner at 100% 0,#000 0 14%,transparent 40%);mask-image:radial-gradient(circle farthest-corner at 100% 0,#000 0 14%,transparent 40%)}'
    + '.pb-ht i:nth-child(2){background:radial-gradient(circle at center,currentColor 0 2.2px,transparent 2.4px) 0 0/11px 11px;-webkit-mask-image:radial-gradient(circle farthest-corner at 100% 0,transparent 0 14%,#000 36%,transparent 64%);mask-image:radial-gradient(circle farthest-corner at 100% 0,transparent 0 14%,#000 36%,transparent 64%)}'
    + '.pb-ht i:nth-child(3){background:radial-gradient(circle at center,currentColor 0 1.2px,transparent 1.4px) 0 0/11px 11px;-webkit-mask-image:radial-gradient(circle farthest-corner at 100% 0,transparent 0 36%,#000 56%,transparent 90%);mask-image:radial-gradient(circle farthest-corner at 100% 0,transparent 0 36%,#000 56%,transparent 90%)}'
    /* footer, like the account menu's */
    + '.pb-foot{display:flex;justify-content:center;align-items:center;gap:10px;margin-top:10px;padding:2px 0 0;font-size:11.5px;line-height:1.4}'
    + '.pb-fk{display:flex;gap:6px}'
    + '.pb-foot a{color:inherit;text-decoration:none;opacity:.85}.pb-foot a:hover{text-decoration:underline;opacity:1}.pb-foot a:focus-visible{background:var(--ba);color:#FBF6EC;opacity:1}'
    + SCROLL_CSS;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var CSS_ALL = CSS + SITES.map(function (s) { return '.pb-s-' + s.id + '{background:' + s.bg + ';color:' + s.fg + '}'; }).join('');
  function css() { if (document.getElementById('pmc-by-css') || document.querySelector('link[data-pmc-menus]')) return; var s = document.createElement('style'); s.id = 'pmc-by-css'; s.textContent = CSS_ALL; document.head.appendChild(s); }
  var EXT = /^(chrome|moz|safari-web)-extension:$/.test(location.protocol), TGT = EXT ? ' target="_blank" rel="noopener noreferrer"' : '';
  var DOTS = '<span class="pb-dots" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
  var open = null;
  function close(focusBtn) {
    if (!open) return; var o = open; open = null;
    o.btn.setAttribute('aria-expanded', 'false');
    if (o.btn._pb != null) { o.btn.innerHTML = o.btn._pb; o.btn.setAttribute('aria-label', 'More by PMC'); o.btn.title = 'More by PMC'; }
    document.removeEventListener('pointerdown', o.onDown, true); document.removeEventListener('keydown', o.onKey, true); removeEventListener('resize', o.onResize);
    o.pop.style.pointerEvents = 'none';
    PS.shut(o.pop, function () { if (!open || open !== o) o.pop.hidden = true; }, o.btn);
    if (focusBtn) o.btn.focus();
  }
  function place(o) {
    var r = o.btn.getBoundingClientRect(), w = o.pop.offsetWidth, h = o.pop.offsetHeight, m = 8;
    var left = r.left + r.width / 2 < innerWidth / 2 ? r.left : r.right - w; left = Math.min(Math.max(m, left), innerWidth - w - m);
    var below = innerHeight - r.bottom - 10 - m, above = r.top - 10 - m, top = h <= below || below >= above ? r.bottom + 10 : r.top - 10 - h;
    o.pop.style.left = left + 'px'; o.pop.style.top = Math.min(Math.max(m, top), Math.max(m, innerHeight - h - m)) + 'px';
  }
  /* mount: makes the button inside an empty element. attach: uses a button the site already has (keep its own look; give it the dots yourself or pass true to fill it). */
  function mount(el) {
    if (!el || el.getAttribute('data-pmc-by-ready')) return; el.setAttribute('data-pmc-by-ready', '1');
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pb-btn';
    btn.innerHTML = DOTS;
    el.appendChild(btn); attach(btn); btn._pb = DOTS; return btn;
  }
  function attach(btn, fill) {
    if (!btn || btn.getAttribute('data-pmc-by-ready')) return; btn.setAttribute('data-pmc-by-ready', '1'); css();
    var host = location.hostname.replace(/^www\./, '');
    btn.type = 'button'; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'More by PMC'); btn.title = 'More by PMC';
    if (fill) btn._pb = btn.innerHTML = DOTS;
    var pop = document.createElement('div'); pop.className = 'pb-pop'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'More by PMC');
    var list = SITES.map(function (s) {
      var here = s.host && s.host === host;
      return '<li><a class="pb-t" href="' + esc(s.url) + '"' + TGT + (here ? ' aria-current="true"' : '') + '><span class="pb-i pb-s-' + s.id + '">' + ICON[s.icon] + '</span><span class="pb-name">' + esc(s.name) + '</span>' + (here ? '<small class="pb-here">You are here</small>' : '') + '</a></li>';
    }).join('');
    var fill = (3 - SITES.length % 3) % 3, filler = '';
    for (var k = 0; k < fill; k++) filler += '<li class="pb-fill" aria-hidden="true"><span class="pb-ht"><i></i><i></i><i></i></span></li>';
    pop.innerHTML = '<div class="pb-in"><ul class="pb-grp">' + list + filler + '</ul>'
      + '<div class="pb-foot"><span class="pb-fk"><a href="https://pmcstudios.uk/privacy"' + TGT + '>Privacy Policy</a> · <a href="https://pmcstudios.uk/terms"' + TGT + '>Terms of Service</a></span></div></div>';
    document.body.appendChild(pop);
    var o = { btn: btn, pop: pop };
    o.onDown = function (e) { if (!pop.contains(e.target) && !btn.contains(e.target)) close(false); };
    o.onKey = function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(true); return; }
      if (e.key.indexOf('Arrow') === 0 || e.key === 'Home' || e.key === 'End') {
        var t = Array.prototype.slice.call(pop.querySelectorAll('.pb-t')), i = t.indexOf(document.activeElement);
        var n = e.key === 'Home' ? 0 : e.key === 'End' ? t.length - 1 : i < 0 ? 0 : e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowDown' ? i + 3 : i - 3;
        if (n >= 0 && n < t.length) { e.preventDefault(); t[n].focus(); }
      }
    };
    o.onResize = function () { place(o); };
    btn.addEventListener('click', function (e) {
      e.stopPropagation(); if (open && open.btn === btn) { close(false); return; } close(false);
      pop.hidden = false; pop.style.pointerEvents = ''; btn.setAttribute('aria-expanded', 'true'); place(o); open = o;
      if (btn._pb != null) { btn.innerHTML = X; btn.setAttribute('aria-label', 'Close'); btn.title = 'Close'; }
      PS.open(pop, btn);
      document.addEventListener('pointerdown', o.onDown, true); document.addEventListener('keydown', o.onKey, true); addEventListener('resize', o.onResize);
      if (e.detail === 0) { var f = pop.querySelector('.pb-t'); f && f.focus({ preventScroll: true }); }
    });
    return btn;
  }
  function auto() { var n = document.querySelectorAll('[data-pmc-by]'); for (var i = 0; i < n.length; i++) mount(n[i]); }
  window.PmcBy = { close: function () { close(false); }, mount: mount, attach: attach, sites: SITES, css: CSS_ALL };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
