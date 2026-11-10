// @ts-nocheck
/* Draws a mind map from an indented outline. The first line is the middle of the map; every line under it is a branch and each step of
   indent goes one level deeper. Returns a small SVG picture as text. The same code runs in Coe Mini (mindmap.js), so a map looks the same in both. */
  var COLORS = ['#337957', '#B49A57', '#1A4934', '#6FB894', '#A33A2B', '#5B4B8A'];
  var INK = '#171717', CREAM = '#F2E4CE', PAPER = '#FBF6EC';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function parse(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n'), nodes = [], stack = [], count = 0;
    var root = { t: '', kids: [], d: 0 };
    stack.push({ ind: -1, n: root });
    lines.forEach(function (raw) {
      if (!raw.trim() || count >= 90) return;
      var ind = (/^[ \t]*/.exec(raw)[0].replace(/\t/g, '  ')).length;
      var t = raw.trim().replace(/^([-*•+]|\d+[.)])\s+/, '').replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/`/g, '').trim();
      if (!t) return;
      if (t.length > 70) t = t.slice(0, 68).trim() + '…';
      while (stack.length > 1 && stack[stack.length - 1].ind >= ind) stack.pop();
      var parent = stack[stack.length - 1].n, n = { t: t, kids: [], d: 0 };
      parent.kids.push(n); stack.push({ ind: ind, n: n }); count++;
    });
    // one line at the top is the middle; several lines at the top all hang off a middle called "Mind map"
    var top = root.kids;
    var mid = top.length === 1 ? top[0] : { t: 'Mind map', kids: top };
    (function depth(n, d) { n.d = d; n.kids.forEach(function (k) { depth(k, d + 1); }); })(mid, 0);
    return mid;
  }
  function wrap(t, max) {
    var words = t.split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      while (w.length > max) { if (cur) { lines.push(cur); cur = ''; } lines.push(w.slice(0, max)); w = w.slice(max); }
      if (!cur) cur = w; else if ((cur + ' ' + w).length <= max) cur += ' ' + w; else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines.slice(0, 4);
  }
  function leaves(n) { return n.kids.length ? n.kids.reduce(function (a, k) { return a + leaves(k); }, 0) : 1; }

  /** opts.width: the room there is, in pixels. opts.title: shown by the caller, not drawn. */
  export function mindmap(text: string, opts?: { width?: number; title?: string }): { svg: string; title: string; nodes: number } | null {
    opts = opts || {};
    var W = Math.max(220, Math.min(1000, opts.width || 700));
    var mid = parse(text);
    if (!mid.kids.length && !mid.t) return null;
    var FS = W < 400 ? 12.5 : 14, CW = FS * 0.6, LH = FS * 1.25, PADX = 8, PADY = 5, GAP = W < 400 ? 22 : 34, VG = 9;
    var both = W >= 540 && mid.kids.length > 1;
    var maxD = 0; (function f(n) { if (n.d > maxD) maxD = n.d; n.kids.forEach(f); })(mid);
    // how many letters fit on a line: share the room between the levels that are drawn on one side
    var levels = Math.max(1, maxD), perSide = both ? 2 : 1;
    var rootW0 = Math.min(160, Math.max(70, mid.t.length * CW + 2 * PADX));
    var room = (W - rootW0 * (both ? 1 : 0.8) - levels * GAP * 1.0) / (levels * perSide / (both ? 2 : 1)) / (both ? 2 : 1);
    var wrapAt = Math.max(9, Math.min(26, Math.floor((room - 2 * PADX) / CW)));
    function size(n) {
      var longestWord = n.t.split(/\s+/).reduce(function (a, w) { return Math.max(a, w.length); }, 1);
      var max = Math.max(n.d === 0 ? Math.max(10, Math.min(18, wrapAt)) : wrapAt, Math.min(longestWord, 20));
      n.lines = wrap(n.t, max);
      var longest = n.lines.reduce(function (a, l) { return Math.max(a, l.length); }, 1);
      n.w = Math.ceil(longest * CW + 2 * PADX); n.h = Math.ceil(n.lines.length * LH + 2 * PADY);
      n.kids.forEach(size);
    }
    size(mid);
    // vertical room each branch needs
    function span(n) { var s = n.kids.length ? n.kids.reduce(function (a, k) { return a + span(k); }, 0) + (n.kids.length - 1) * VG : 0; n.span = Math.max(n.h, s); return n.span; }
    // split the first-level branches between right and left, so both sides are about as tall
    var right = mid.kids, left = [];
    if (both) {
      var total = mid.kids.reduce(function (a, k) { return a + leaves(k); }, 0), acc = 0; right = []; 
      mid.kids.forEach(function (k) { if (acc < total / 2) { right.push(k); acc += leaves(k); } else left.push(k); });
      if (!left.length) left = [right.pop()];
    }
    right.forEach(span); left.forEach(span);
    var sumSpan = function (a) { return a.length ? a.reduce(function (s, k) { return s + k.span; }, 0) + (a.length - 1) * VG : 0; };
    var H = Math.max(sumSpan(right), sumSpan(left), mid.h) + 16;
    // each level's column is as wide as its widest label
    function colWidths(kids) { var w = []; (function f(n) { w[n.d] = Math.max(w[n.d] || 0, n.w); n.kids.forEach(f); })({ d: 0, w: 0, kids: kids }); return w; }
    var rw = colWidths(right), lw = colWidths(left);
    var rightW = 0; for (var i = 1; i < rw.length; i++) rightW += (rw[i] || 0) + GAP;
    var leftW = 0; for (var j = 1; j < lw.length; j++) leftW += (lw[j] || 0) + GAP;
    var midX = both ? Math.max(leftW, 0) : 0;
    var totalW = midX + mid.w + rightW + 4;
    var parts = [], nodesSvg = [];
    mid.x = midX; mid.y = H / 2 - mid.h / 2; mid.c = INK;
    function place(kids, dir, startX, color0) {
      // dir: 1 = to the right, -1 = to the left. startX is the edge of the parent the branches leave from.
      var widths = dir > 0 ? rw : lw, total = sumSpan(kids), y = H / 2 - total / 2;
      // y of a node: centred over its children, or placed in turn when it is a leaf
      var cursor = y;
      function lay(n) {
        var top = cursor;
        if (!n.kids.length) { n.cy = top + n.span / 2; cursor += n.span + VG; return; }
        n.kids.forEach(lay);
        var a = n.kids[0].cy, b = n.kids[n.kids.length - 1].cy; n.cy = (a + b) / 2;
      }
      kids.forEach(lay);
      function y0(n) { return n.cy - n.h / 2; }
      // columns: all nodes of one level share a left edge (right side) or right edge (left side)
      var edge = []; // edge[d] = x where level d starts
      var x = startX;
      for (var d = 1; d < widths.length; d++) {
        if (dir > 0) { edge[d] = x + GAP; x = edge[d] + (widths[d] || 0); } else { edge[d] = x - GAP; x = edge[d] - (widths[d] || 0); }
      }
      function draw(n, px, py, col) {
        var w = widths[n.d] || n.w, x1 = dir > 0 ? edge[n.d] : edge[n.d] - w;
        n.x = dir > 0 ? x1 : x1 + w - n.w; n.y = y0(n); n.c = col;
        var cy = n.y + n.h / 2, ex = dir > 0 ? n.x : n.x + n.w, mx = (px + ex) / 2, sw = n.d === 1 ? 3.2 : 2.2;
        parts.push('<path d="M' + px.toFixed(1) + ' ' + py.toFixed(1) + ' C' + mx.toFixed(1) + ' ' + py.toFixed(1) + ' ' + mx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + ex.toFixed(1) + ' ' + cy.toFixed(1) + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '" stroke-linecap="round"/>');
        var out = dir > 0 ? n.x + n.w : n.x;
        n.kids.forEach(function (k) { draw(k, out, cy, col); });
        nodesSvg.push(node(n, col));
      }
      kids.forEach(function (k, i) { draw(k, startX, mid.y + mid.h / 2, COLORS[(color0 + i) % COLORS.length]); });
    }
    function node(n, col) {
      var tx = n.x + n.w / 2, ty = n.y + PADY + FS * 0.92, t = '';
      n.lines.forEach(function (l, i) { t += '<tspan x="' + tx.toFixed(1) + '" y="' + (ty + i * LH).toFixed(1) + '">' + esc(l) + '</tspan>'; });
      if (n.d === 0) return '<rect x="' + n.x.toFixed(1) + '" y="' + n.y.toFixed(1) + '" width="' + n.w + '" height="' + n.h + '" fill="' + INK + '" stroke="' + INK + '" stroke-width="3"/><text text-anchor="middle" font-size="' + FS + '" fill="' + CREAM + '" font-weight="700">' + t + '</text>';
      if (n.d === 1) { var dark = col === '#B49A57' || col === '#6FB894'; return '<rect x="' + n.x.toFixed(1) + '" y="' + n.y.toFixed(1) + '" width="' + n.w + '" height="' + n.h + '" fill="' + col + '" stroke="' + INK + '" stroke-width="2"/><text text-anchor="middle" font-size="' + FS + '" fill="' + (dark ? INK : '#fff') + '" font-weight="700">' + t + '</text>'; }
      return '<rect x="' + n.x.toFixed(1) + '" y="' + n.y.toFixed(1) + '" width="' + n.w + '" height="' + n.h + '" fill="' + PAPER + '" stroke="' + col + '" stroke-width="2"/><text text-anchor="middle" font-size="' + FS + '" fill="' + INK + '">' + t + '</text>';
    }
    // the middle node must be placed before the branches leave it
    place(right, 1, mid.x + mid.w, 0);
    if (left.length) place(left, -1, mid.x, right.length);
    nodesSvg.push(node(mid, INK));
    var vw = Math.max(totalW, 100);
    var svg = '<svg class="mm" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + (Math.ceil(vw) + 8) + ' ' + (Math.ceil(H) + 8) + '" width="100%" role="img" aria-label="Mind map: ' + esc(mid.t) + '" style="font-family:var(--t);max-width:' + (Math.ceil(vw) + 8) + 'px"><g transform="translate(4,4)">' + parts.join('') + nodesSvg.join('') + '</g></svg>';
    return { svg: svg, title: mid.t, nodes: 1 + (function c(n) { return n.kids.reduce(function (a, k) { return a + 1 + c(k); }, 0); })(mid) };
  }

