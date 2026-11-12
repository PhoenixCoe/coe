/* By PMC: the apps grid button, like the one Google has. One file, no dependencies.
   Static site:  <span data-pmc-by></span> + <script src="pmc-by.js" defer></script>
   React or any app:  PmcBy.mount(element)  (the element must be empty; React must not render children in it),
   or PmcBy.attach(button, true) to use a button the site already has.
   A site that does not allow inline styles links css/pmc-menus.css (made by build-css.mjs) with the attribute data-pmc-menus instead.
   The list lives in SITES below. Change it here and copy this file to every PMC site. */
(function () {
  if (window.PmcBy) return;
  var SITES = [
    { id: 'studio', name: 'Studios', host: 'pmcstudios.uk', url: 'https://pmcstudios.uk/', icon: 'pmc', bg: '#171717', fg: '#F2E4CE' },
    { id: 'tools', name: 'Tools', host: 'tools.pmcstudios.uk', url: 'https://tools.pmcstudios.uk/', icon: 'tools', bg: '#B49A57', fg: '#171717' },
    { id: 'coe', name: 'Coe', host: 'coe.pmcstudios.uk', url: 'https://coe.pmcstudios.uk/', icon: 'star', bg: '#F2E4CE', fg: '#337957' },
    { id: 'mini', name: 'Coe Mini', host: '', url: 'https://coe.pmcstudios.uk/about/', icon: 'mini', bg: '#337957', fg: '#F2E4CE' },
    { id: 'account', name: 'Account', host: 'accounts.pmcstudios.uk', url: 'https://accounts.pmcstudios.uk/', icon: 'user', bg: '#1A4934', fg: '#F2E4CE' }
  ];
  var STAR = 'M786.886 22.9033C790.107 14.1976 802.421 14.1978 805.643 22.9033L825.213 75.79C875.855 212.649 983.761 320.556 1120.62 371.198L1173.51 390.768C1182.21 393.989 1182.21 406.304 1173.51 409.525L1120.62 429.095C983.761 479.737 875.855 587.643 825.213 724.503L805.643 777.39C802.421 786.095 790.107 786.095 786.886 777.39L767.316 724.503C716.674 587.643 608.768 479.737 471.908 429.095L419.021 409.525C410.316 406.304 410.316 393.989 419.021 390.768L471.908 371.198C608.768 320.556 716.674 212.65 767.316 75.79L786.886 22.9033ZM796.265 272.595C726.494 272.595 669.934 329.155 669.934 398.926C669.934 468.696 726.494 525.257 796.265 525.257C866.035 525.257 922.595 468.696 922.596 398.926C922.596 329.155 866.035 272.595 796.265 272.595Z', PMC = 'M1264.16 741.211L1516.85 3.66211H1741.7V1190.81H1742.03V1281.33H2527.92V1453.42H1569.94V1190.81H1570.31V395.508L1285.4 1192.38L1263.43 1251.96L1241.46 1192.38L958.008 409.424V1192.38H957.979V1453.42H0V1281.33H785.889V3.66211H1012.94L1264.16 741.211Z M2221.44 0C2227.29 0 2233.4 0.244141 2239.75 0.732422C2256.84 0.732422 2274.66 1.70898 2293.21 3.66211C2423.1 26.6113 2516.11 118.652 2572.27 279.785L2581.05 323.73L2419.19 367.676C2387.94 279.297 2348.63 220.947 2301.27 192.627C2254.39 163.818 2205.08 163.086 2153.32 190.43C2109.38 217.773 2076.9 259.033 2055.91 314.209C2035.4 368.896 2025.15 458.008 2025.15 581.543C2020.26 659.668 2025.63 737.793 2041.26 815.918C2056.88 894.043 2084.47 949.219 2124.02 981.445C2164.06 1013.18 2216.55 1022.22 2281.49 1008.54C2340.58 985.596 2386.23 926.27 2418.46 830.566L2581.05 878.174C2556.15 977.783 2503.17 1064.94 2422.12 1139.65C2369.87 1177.73 2305.91 1196.78 2230.22 1196.78C2220.95 1197.75 2211.91 1198.24 2203.12 1198.24H2189.21C2073.97 1192.87 1984.86 1129.15 1921.88 1007.08C1876.46 929.443 1852.05 791.504 1848.63 593.262C1848.14 580.078 1847.9 566.895 1847.9 553.711C1848.88 384.766 1875.24 256.104 1927 167.725C1976.81 91.5527 2034.42 43.2129 2099.85 22.7051C2137.94 7.56836 2178.47 0 2221.44 0Z M292.969 4.39453C387.695 4.39453 466.309 27.5879 528.809 73.9746C627.93 146.729 682.861 242.432 693.604 361.084C695.557 382.568 696.533 403.32 696.533 423.34C696.533 528.32 669.678 611.328 615.967 672.363C540.283 766.602 434.57 819.336 298.828 830.566H174.316V1191.65H0.732422L0 4.39453H292.969ZM437.988 220.459C387.695 181.885 336.426 165.283 284.18 170.654H175.049V656.25H292.236C366.943 657.227 426.758 629.15 471.68 572.021C517.09 514.893 534.912 451.172 525.146 380.859C517.334 312.012 488.281 258.545 437.988 220.459Z';
  var S = 'fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter"';
  var ICON = {
    pmc: '<svg viewBox="0 0 2582 1454" width="54" height="30" fill="currentColor" aria-hidden="true"><path d="' + PMC + '"/></svg>',
    star: '<svg viewBox="405 10 782 782" width="48" height="48" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="' + STAR + '"/></svg>',
    tools: '<svg viewBox="0 0 24 24" width="46" height="46" ' + S + ' aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>',
    mini: '<svg viewBox="405 10 782 782" width="36" height="36" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="' + STAR + '"/></svg>',
    user: '<svg viewBox="0 0 24 24" width="46" height="46" ' + S + ' aria-hidden="true"><path d="M8 4h8v8H8zM4 21v-3h16v3"/></svg>'
  };
  var CSS = '.pb-btn{display:inline-grid;place-items:center;width:var(--pb-size,40px);height:var(--pb-size,40px);padding:0;margin:0;background:var(--pb-bg,transparent);color:var(--pb-fg,currentColor);border:var(--pb-frame,3px) solid currentColor;border-radius:0;cursor:pointer;box-shadow:var(--pb-shadow,none);transition:background .1s,color .1s,box-shadow .1s;font:inherit;-webkit-tap-highlight-color:transparent}'
    + '.pb-btn:hover,.pb-btn[aria-expanded="true"]{background:var(--pb-hover-bg,#171717);color:var(--pb-hover-fg,#F2E4CE)}'
    + '.pb-btn:focus-visible{outline:4px solid #337957;outline-offset:3px}'
    + '.pb-dots{display:grid;grid-template-columns:repeat(3,6px);gap:3px}.pb-dots i{width:6px;height:6px;background:currentColor;display:block}'
    + '.pb-pop{position:fixed;z-index:2147483000;width:min(372px,calc(100vw - 16px));max-height:calc(100vh - 16px);max-height:calc(100dvh - 16px);overflow:auto;overscroll-behavior:contain;box-sizing:border-box;background:#F2E4CE;color:#171717;border:3px solid #171717;box-shadow:8px 8px 0 #1A4934;padding:10px;font-family:var(--d,"PMC Header","Shoulders","Arial Narrow",Impact,sans-serif);text-transform:uppercase;font-weight:400;font-synthesis:none;-webkit-font-smoothing:antialiased;line-height:1;animation:pbup .18s cubic-bezier(.16,1,.3,1) backwards}'
    + '.pb-pop[hidden]{display:none}'
    + '.pb-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 8px;padding-left:4px}'
    + '.pb-ttl{font-size:1.45rem;letter-spacing:.03em}'
    + '.pb-close{display:grid;place-items:center;flex:none;width:34px;height:34px;margin:0;padding:0;background:transparent;color:#171717;border:3px solid #171717;border-radius:0;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .1s,color .1s}'
    + '.pb-close:hover,.pb-close:focus-visible{background:#171717;color:#F2E4CE;outline:none}'
    + '.pb-close:focus-visible{box-shadow:0 0 0 3px #337957}'
    + '.pb-card{background:#FBF6EC;border:3px solid #171717;padding:12px 6px 8px}'
    + '.pb-g{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;list-style:none;margin:0;padding:0}'
    + '.pb-t{position:relative;display:grid;justify-items:center;align-content:start;gap:10px;padding:10px 2px 12px;color:#171717;text-decoration:none;border:3px solid transparent;text-align:center;font-size:1.25rem;letter-spacing:.03em;line-height:1;transition:background .1s,transform .12s cubic-bezier(.16,1,.3,1)}'
    + '.pb-t:hover,.pb-t:focus-visible{background:#D5E8DC;border-color:#171717;outline:none}'
    + '.pb-t:hover .pb-i,.pb-t:focus-visible .pb-i{transform:translate(-2px,-2px);box-shadow:6px 6px 0 #1A4934}'
    + '.pb-t:active .pb-i{transform:translate(2px,2px);box-shadow:2px 2px 0 #1A4934}'
    + '.pb-t[aria-current="true"]{background:#171717;color:#F2E4CE}'
    + '.pb-i{display:grid;place-items:center;width:76px;height:76px;border:3px solid #171717;box-shadow:4px 4px 0 #1A4934;transition:transform .12s cubic-bezier(.16,1,.3,1),box-shadow .12s cubic-bezier(.16,1,.3,1)}'
    + '.pb-t[aria-current="true"] .pb-i{border-color:#F2E4CE;box-shadow:4px 4px 0 #337957}'
    + '.pb-here{display:block;margin-top:-4px;font-size:.78rem;letter-spacing:.06em;color:#6FB894}'
    + '@keyframes pbup{from{opacity:0;transform:translateY(8px) scale(.98)}}'
    + '@media (max-width:480px){.pb-pop{left:8px!important;right:8px!important;top:auto!important;bottom:8px!important;width:auto}}'
    + '@media (prefers-reduced-motion:reduce){.pb-pop{animation:none}.pb-t,.pb-i{transition:none}}';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var CSS_ALL = CSS + SITES.map(function (s) { return '.pb-s-' + s.id + '{background:' + s.bg + ';color:' + s.fg + '}'; }).join('');
  function css() { if (document.getElementById('pmc-by-css') || document.querySelector('link[data-pmc-menus]')) return; var s = document.createElement('style'); s.id = 'pmc-by-css'; s.textContent = CSS_ALL; document.head.appendChild(s); }
  var EXT = /^(chrome|moz|safari-web)-extension:$/.test(location.protocol), TGT = EXT ? ' target="_blank" rel="noopener noreferrer"' : '';
  var open = null;
  function close(focusBtn) {
    if (!open) return; var o = open; open = null;
    o.pop.hidden = true; o.btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', o.onDown, true); document.removeEventListener('keydown', o.onKey, true); removeEventListener('resize', o.onResize);
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
    btn.innerHTML = '<span class="pb-dots" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
    el.appendChild(btn); attach(btn); return btn;
  }
  function attach(btn, fill) {
    if (!btn || btn.getAttribute('data-pmc-by-ready')) return; btn.setAttribute('data-pmc-by-ready', '1'); css();
    var host = location.hostname.replace(/^www\./, '');
    btn.type = 'button'; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'More by PMC'); btn.title = 'More by PMC';
    if (fill) btn.innerHTML = '<span class="pb-dots" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
    var pop = document.createElement('div'); pop.className = 'pb-pop'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'More by PMC');
    var list = SITES.map(function (s) {
      var here = s.host && s.host === host;
      return '<li><a class="pb-t" href="' + esc(s.url) + '"' + TGT + (here ? ' aria-current="true"' : '') + '><span class="pb-i pb-s-' + s.id + '">' + ICON[s.icon] + '</span><span>' + esc(s.name) + '</span>' + (here ? '<small class="pb-here">You are here</small>' : '') + '</a></li>';
    }).join('');
    pop.innerHTML = '<div class="pb-top"><b class="pb-ttl">More by PMC</b><button type="button" class="pb-close" aria-label="Close" title="Close"><svg viewBox="0 0 24 24" width="18" height="18" ' + S + ' aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg></button></div><div class="pb-card"><ul class="pb-g">' + list + '</ul></div>';
    pop.querySelector('.pb-close').addEventListener('click', function () { close(true); });
    document.body.appendChild(pop);
    var o = { btn: btn, pop: pop };
    o.onDown = function (e) { if (!pop.contains(e.target) && !btn.contains(e.target)) close(false); };
    o.onKey = function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(true); return; }
      if (e.key.indexOf('Arrow') === 0) {
        var t = Array.prototype.slice.call(pop.querySelectorAll('.pb-t')), i = t.indexOf(document.activeElement); if (i < 0) return;
        var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'ArrowDown' ? i + 3 : i - 3;
        if (n >= 0 && n < t.length) { e.preventDefault(); t[n].focus(); }
      }
    };
    o.onResize = function () { place(o); };
    btn.addEventListener('click', function (e) {
      e.stopPropagation(); if (open && open.btn === btn) { close(false); return; } close(false);
      pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); place(o); open = o;
      document.addEventListener('mousedown', o.onDown, true); document.addEventListener('keydown', o.onKey, true); addEventListener('resize', o.onResize);
      if (e.detail === 0) { var f = pop.querySelector('.pb-t'); f && f.focus(); }
    });
    return btn;
  }
  function auto() { var n = document.querySelectorAll('[data-pmc-by]'); for (var i = 0; i < n.length; i++) mount(n[i]); }
  window.PmcBy = { mount: mount, attach: attach, sites: SITES, css: CSS_ALL };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();
