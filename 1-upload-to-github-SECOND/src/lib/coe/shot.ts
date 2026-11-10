/**
 * A picture of a web page, taken on this device. The page runs in a hidden, sandboxed frame; when it has settled, the frame hands back its
 * finished HTML, and the browser draws that to a picture itself. Nothing is sent anywhere. Pictures that load from other sites are left out
 * (the browser does not allow them inside a picture of a page), so a page that needs the network shows its own words and colours only.
 */
import type { Img } from '@/coe/store';

const HELPER = `<script>(function(){
var send=function(m){parent.postMessage(m,'*')};
addEventListener('error',function(e){send({coeLog:1,kind:'error',msg:String(e.message||e.error||'Error'),line:e.lineno||0})});
addEventListener('unhandledrejection',function(e){send({coeLog:1,kind:'error',msg:String(e.reason&&e.reason.message||e.reason||'Error'),line:0})});
var ce=console.error;console.error=function(){try{send({coeLog:1,kind:'console',msg:Array.prototype.map.call(arguments,function(a){return typeof a==='string'?a:(a&&a.message)||String(a)}).join(' ').slice(0,300),line:0})}catch(x){}return ce.apply(console,arguments)};
addEventListener('message',function(e){var m=e.data;if(!m||m.coeShot!==1)return;
try{var d=document,cv=[].slice.call(d.querySelectorAll('canvas')),urls=cv.map(function(c){try{return c.toDataURL()}catch(x){return ''}});
var w=Math.max(d.documentElement.scrollWidth,d.body?d.body.scrollWidth:0,innerWidth),h=Math.max(d.documentElement.scrollHeight,d.body?d.body.scrollHeight:0);
var root=d.documentElement.cloneNode(true);[].slice.call(root.querySelectorAll('script')).forEach(function(s){s.remove()});
[].slice.call(root.querySelectorAll('canvas')).forEach(function(c,i){if(!urls[i])return;var im=d.createElement('img');im.setAttribute('src',urls[i]);im.setAttribute('style',(c.getAttribute('style')||'')+';width:'+(c.clientWidth||c.width)+'px;height:'+(c.clientHeight||c.height)+'px');if(c.className)im.className=c.className;c.parentNode.replaceChild(im,c)});
[].slice.call(d.querySelectorAll('input,textarea,select')).forEach(function(el,i){var cl=root.querySelectorAll('input,textarea,select')[i];if(!cl)return;if(el.tagName==='TEXTAREA')cl.textContent=el.value;else if(el.tagName==='INPUT'){cl.setAttribute('value',el.value);if(el.checked)cl.setAttribute('checked','checked');else cl.removeAttribute('checked')}});
if(!root.getAttribute('xmlns'))root.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
send({coeShot:2,id:m.id,xml:new XMLSerializer().serializeToString(root),w:w,h:h})}catch(x){send({coeShot:2,id:m.id,err:String(x)})}});
})();<\/script>`;

/** Puts the helper in front of the page's own code. */
export const withHelper = (html: string) => {
  const t = html.trim();
  if (/<head[\s>]/i.test(t)) return t.replace(/<head([^>]*)>/i, (m) => m + HELPER);
  if (/<html[\s>]/i.test(t)) return t.replace(/<html([^>]*)>/i, (m) => m + '<head>' + HELPER + '</head>');
  return HELPER + t;
};

export interface Shot { img: Img; width: number; height: number }

/** Takes a picture of the page. `width` is the screen width to lay it out at (390 phone, 768 tablet, 1024 desktop). */
export function shootHtml(html: string, opts: { width?: number; wait?: number; maxHeight?: number } = {}): Promise<Shot> {
  const W = Math.max(280, Math.min(1600, Math.round(opts.width ?? 1024))), MAXH = opts.maxHeight ?? 2400;
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;height:800px;border:0;opacity:0;pointer-events:none`;
    let done = false;
    const end = (fn: () => void) => { if (done) return; done = true; clearTimeout(t); window.removeEventListener('message', on); f.remove(); fn(); };
    const t = setTimeout(() => end(() => reject(new Error('The page took too long to settle, so no picture was taken.'))), 12000);
    const on = (e: MessageEvent) => {
      if (e.source !== f.contentWindow || !e.data || e.data.coeShot !== 2 || e.data.id !== id) return;
      const m = e.data as { xml?: string; w?: number; h?: number; err?: string };
      if (!m.xml) { end(() => reject(new Error(m.err || 'The page could not be read.'))); return; }
      const w = Math.max(W, Math.min(2400, Math.round(m.w ?? W))), h = Math.max(200, Math.min(MAXH, Math.round(m.h ?? 800)));
      const scale = w > 1280 ? 1280 / w : 1, cw = Math.round(w * scale), ch = Math.round(h * scale);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="${w}" height="${h}">${m.xml}</foreignObject></svg>`;
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas'); c.width = cw; c.height = ch;
          const x = c.getContext('2d'); if (!x) throw new Error('no canvas');
          x.fillStyle = '#ffffff'; x.fillRect(0, 0, cw, ch); x.drawImage(img, 0, 0, cw, ch);
          const url = c.toDataURL('image/png');
          end(() => resolve({ img: { name: 'screenshot.png', type: 'image/png', data: url.split(',')[1] ?? '' }, width: cw, height: ch }));
        } catch { end(() => reject(new Error('This browser does not let a page be saved as a picture. It works in Chrome and Edge.'))); }
      };
      img.onerror = () => end(() => reject(new Error('The page could not be drawn as a picture.')));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    };
    window.addEventListener('message', on);
    f.onload = () => setTimeout(() => { try { f.contentWindow?.postMessage({ coeShot: 1, id }, '*'); } catch { end(() => reject(new Error('The page could not be reached.'))); } }, opts.wait ?? 800);
    f.srcdoc = withHelper(html);
    document.body.appendChild(f);
  });
}
