/**
 * The feel of a PMC toggle. Click it, or drag it: it pulls back unless you mean it.
 * The knob follows your finger at a fraction of the distance, stretches a little, and rubber-bands at the ends.
 * Let go past the middle (or flick it) and it springs across; let go before that and it springs back.
 * It works on any toggle the PMC styles draw: label.check, button.swt-b and button.sw. One script covers all of them.
 */
function startPmcFeel() {
  if (typeof window === 'undefined' || window.__pmcFeel) return;
  window.__pmcFeel = true;
  var TRAVEL = 26;        // how far the knob goes, in pixels
  var PULL = 0.6;         // the knob moves 6 pixels for every 10 you drag: it takes some effort
  var DEAD = 4;           // under this it is a click, not a drag
  var HALF = TRAVEL / 2;  // let go past this and it switches
  var FLICK = 0.7;        // a quick flick (pixels per millisecond) also switches it
  var SEL = '.check:not(.tick), button.swt-b, button.sw';
  var drag = null, swallow = false;

  var inputOf = function (h) { return h.matches('.check') ? h.querySelector('input') : null; };
  var isOn = function (h) { var i = inputOf(h); return i ? !!i.checked : h.getAttribute('aria-checked') === 'true'; };
  var isOff = function (h) { var i = inputOf(h); return i ? !i || i.disabled : !!h.disabled; };
  var trackRect = function (h) {
    var r = h.getBoundingClientRect();
    if (h.matches('.check')) { var mid = r.top + r.height / 2; return { left: r.left, right: r.left + 58, top: mid - 16, bottom: mid + 16 }; }
    if (h.matches('button.sw')) { var t = h.querySelector('i'); if (t) return t.getBoundingClientRect(); }
    return r;
  };
  // past either end the knob stretches like rubber instead of stopping dead
  var band = function (p) { return p < 0 ? -6 * (1 - Math.exp(p / 18)) : p > TRAVEL ? TRAVEL + 6 * (1 - Math.exp(-(p - TRAVEL) / 18)) : p; };

  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var h = e.target && e.target.closest ? e.target.closest(SEL) : null;
    if (!h || isOff(h)) return;
    var r = trackRect(h);
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
    drag = { h: h, id: e.pointerId, x0: e.clientX, on: isOn(h), moved: false, pos: isOn(h) ? TRAVEL : 0, v: 0, lx: e.clientX, lt: performance.now() };
  }, true);

  document.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x0;
    if (!drag.moved) {
      if (Math.abs(dx) < DEAD) return;
      drag.moved = true; drag.h.classList.add('pmc-drag');
      try { drag.h.setPointerCapture(e.pointerId); } catch (x) { /* fine */ }
    }
    var d = drag.on ? -dx : dx;                              // positive: pulling it towards the other side
    var raw = drag.on ? TRAVEL - PULL * d : PULL * d;
    drag.pos = band(raw);
    var now = performance.now(), dt = Math.max(1, now - drag.lt);
    drag.v = 0.6 * drag.v + 0.4 * ((e.clientX - drag.lx) / dt); drag.lx = e.clientX; drag.lt = now;
    var stretch = 28 + 5 * Math.min(1, Math.abs(drag.pos - (drag.on ? TRAVEL : 0)) / TRAVEL);
    drag.h.style.setProperty('--kx', drag.pos.toFixed(2));
    drag.h.style.setProperty('--kw', stretch.toFixed(2));
    e.preventDefault();
  }, { passive: false, capture: true });

  var end = function (e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag; drag = null;
    if (!d.moved) return;                                    // a plain click: let it through
    var toward = d.on ? -d.v : d.v;                          // flick speed towards the other side
    var past = d.on ? d.pos < HALF : d.pos > HALF;
    var flip = !cancelled && (past || (toward > FLICK && Math.abs(d.pos - (d.on ? TRAVEL : 0)) > 6));
    swallow = true;                                          // the click the browser sends after a drag is ignored
    setTimeout(function () {
      swallow = false;
      var settle = function () { d.h.classList.remove('pmc-drag'); d.h.style.removeProperty('--kx'); d.h.style.removeProperty('--kw'); };
      if (flip) { d.h.click(); requestAnimationFrame(function () { requestAnimationFrame(settle); }); } else settle();
    }, 0);
  };
  document.addEventListener('pointerup', function (e) { end(e, false); }, true);
  document.addEventListener('pointercancel', function (e) { end(e, true); }, true);
  document.addEventListener('click', function (e) {
    if (!swallow) return;
    var h = e.target && e.target.closest ? e.target.closest(SEL) : null;
    if (h) { e.stopPropagation(); e.preventDefault(); swallow = false; }
  }, true);
}
if (typeof module !== 'undefined') module.exports = { startPmcFeel };
if (typeof window !== 'undefined') startPmcFeel();
