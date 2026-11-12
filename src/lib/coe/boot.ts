/**
 * A small script that runs before anything else on the page, written in old-fashioned JavaScript so that even a very old phone can run it.
 * Its job: if Coe does not open (a file did not arrive, the phone dropped its connection, an old copy of the site is stuck in the cache,
 * or the browser is too old for part of the code), say so in plain words and give buttons that fix it, instead of leaving a dead screen.
 */
export const BOOT_JS = `(function(){
var w=window,d=document,shown=0,last='',started=Date.now();
/* text size: a phone or tablet starts smaller than a computer (the same rule as Settings), set before anything is drawn so the page does not jump */
(function(){try{var s=null;try{s=JSON.parse(localStorage.getItem('pmc:coe:settings')||'null')}catch(e){}
var sc=0;if(s&&s.autoScale===false)sc=Number(s.scale);else if(s&&s.autoScale===undefined&&s.scale===undefined&&s.size==='large')sc=115;else if(s&&s.autoScale===undefined&&s.scale!==undefined&&Number(s.scale)!==100)sc=Number(s.scale);
if(!sc){var t=(navigator.maxTouchPoints>1)||(w.matchMedia&&w.matchMedia('(pointer: coarse)').matches),m=Math.min(w.screen.width||9999,w.screen.height||9999);sc=(t&&m<=1100)?(m<600?90:85):100}
sc=Math.min(150,Math.max(75,sc||100));d.documentElement.style.fontSize=(Math.round(13.5*sc)/100)+'px'}catch(e){}})();
function ready(){try{return d.documentElement.className.indexOf('coe-ready')>-1}catch(e){return false}}
function up(){try{return !ready()&&(!!d.querySelector('.ld')||d.documentElement.id==='__next_error__')}catch(e){return false}}
function st(){var s=d.createElement('style');s.id='coe-stuck-css';s.textContent='#coe-stuck{position:fixed;left:0;right:0;top:62vh;z-index:2147483000;display:flex;flex-direction:column;align-items:center;gap:12px;padding:0 16px;text-align:center;pointer-events:none;color:var(--cream,#F2E4CE)}#coe-stuck b{font:inherit;font-family:var(--t,monospace);font-size:.95rem;font-weight:400;opacity:.85;line-height:1.35;max-width:36ch}#coe-stuck .row{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;pointer-events:auto}#coe-stuck button{font-family:var(--d,Impact,sans-serif);font-size:1.1rem;line-height:1;letter-spacing:.03em;text-transform:uppercase;min-height:44px;padding:8px 14px;color:var(--cream,#F2E4CE);background:transparent;border:2px solid var(--cream,#F2E4CE);box-shadow:3px 3px 0 var(--g2,#1A4934);cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:transform .1s,box-shadow .1s}#coe-stuck button.go{color:var(--ink,#171717);background:var(--gold,#B49A57);border-color:var(--gold,#B49A57)}#coe-stuck button:hover{box-shadow:5px 5px 0 var(--g2,#1A4934)}#coe-stuck button:active{box-shadow:1px 1px 0 var(--g2,#1A4934);transform:translate(2px,2px)}#coe-stuck small{display:block;font-family:var(--t,monospace);font-size:11px;opacity:.55;max-width:44ch;word-break:break-word}#coe-stuck .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}';d.head.appendChild(s)}
/* the buttons sit right under the loading bar and its words, wherever they are on this screen */
function place(){try{var e=d.getElementById('coe-stuck');if(!e)return;var a=d.querySelector('.ld-line')||d.querySelector('.ld-bar');if(!a)return;var r=a.getBoundingClientRect();if(r.bottom>0)e.style.top=Math.round(r.bottom+16)+'px'}catch(x){}}
function wipe(){
 try{sessionStorage.setItem('pmc:coe:rec',String(Date.now()))}catch(e){}
 var jobs=[];
 try{if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations)jobs.push(navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister()}))}))}catch(e){}
 try{if(w.caches&&w.caches.keys)jobs.push(w.caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return w.caches['delete'](k)}))}))}catch(e){}
 var go=function(){location.replace(location.pathname+'?fresh='+Date.now())};
 try{Promise.all(jobs).then(go,go)}catch(e){go()}
 setTimeout(go,2500)
}
var cur=null;
function draw(title,text,why){
 cur=[title,text,why];
 var old=d.getElementById('coe-stuck'); if(old&&old.parentNode)old.parentNode.removeChild(old);
 if(!d.getElementById('coe-stuck-css')){st();}
 var e=d.createElement('div');e.id='coe-stuck';e.setAttribute('role','alert');
 e.innerHTML='<b></b><div class="row"><button class="go" type="button" id="coe-again">Reload</button><button type="button" id="coe-fix">Fix and reload</button></div><small></small><span class="sr"></span>';
 e.getElementsByTagName('b')[0].textContent=title;e.getElementsByTagName('small')[0].textContent=why||'';e.getElementsByTagName('span')[0].textContent=text;
 (d.body||d.documentElement).appendChild(e);place()
}
function show(title,text,why){
 if(shown&&shown===title+why&&d.getElementById('coe-stuck'))return; shown=title+why;
 draw(title,text,why)
}
// The buttons are handled here, before the page's own code sees the click: while the app is still starting, React holds back clicks on the page.
w.addEventListener('click',function(ev){
 try{var t=ev.target,id=t&&(t.id||(t.closest&&t.closest('button')&&t.closest('button').id));
  if(id==='coe-fix'){ev.preventDefault();ev.stopPropagation();wipe()}
  else if(id==='coe-again'){ev.preventDefault();ev.stopPropagation();location.reload()}
 }catch(e){}
},true);
function failed(why){
 last=why;
 var t=0;try{t=Number(sessionStorage.getItem('pmc:coe:rec')||0)}catch(e){}
 var offline=false;try{offline=navigator.onLine===false}catch(e){}
 // First problem in a while: quietly clear old files and try once more. After that, say what is wrong.
 if(!offline&&(!t||Date.now()-t>300000)){wipe();return}
 var old=/SyntaxError|Invalid regular|Unexpected token|group specifier|lookbehind/i.test(why);
 show(offline?'You are offline':'Coe could not open',offline?'Your phone has no connection right now. Turn Wi-Fi or mobile data back on, then press Reload.':old?'This browser looks too old for part of Coe. Updating iOS, Android or your browser usually fixes it. You can also press Fix and reload.':'Part of Coe did not arrive, often because the connection dropped. Press Reload. If it keeps happening, press Fix and reload.',why)
}
w.addEventListener('error',function(ev){
 try{var t=ev.target;
  if(t&&t!==w&&t.tagName==='SCRIPT'&&/_next\\/static/.test(t.src||'')){failed('A file did not load: '+String(t.src).split('/').pop());return}
  if(up()&&ev.message&&/SyntaxError|Invalid regular|Unexpected token|group specifier/i.test(ev.message))failed(ev.message)
 }catch(e){}
},true);
w.addEventListener('unhandledrejection',function(ev){
 try{var r=ev&&ev.reason,m=(r&&(r.message||r.name))||String(r||'');
  if(up()&&/ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed|Invalid regular|SyntaxError|group specifier/i.test(m))failed(m)
 }catch(e){}
});
w.addEventListener('resize',place);w.addEventListener('orientationchange',function(){setTimeout(place,300)});
w.addEventListener('offline',function(){if(up())show('You are offline','Your phone has no connection right now. Turn Wi-Fi or mobile data back on, then press Reload.','')});
// The loading screen asks for this bar instead of drawing buttons of its own, so there is only ever one set of buttons.
w.__coeStuck=function(title,text,why){show(title,text,why||last)};
var ms=Number(w.__coeBootMs)||12000;
/* A slow download is not a broken one: it is only cleaned up and restarted when nothing new has arrived for a good while (or after a long time overall). */
var rn=0,rt=Date.now();
function prog(){try{var n=w.performance.getEntriesByType('resource').length;if(n!==rn){rn=n;rt=Date.now()}}catch(e){}}
function recent(){var t=0;try{t=Number(sessionStorage.getItem('pmc:coe:rec')||0)}catch(e){}return !!t&&Date.now()-t<=300000}
function stalled(){try{var offline=false;try{offline=navigator.onLine===false}catch(e){}
 if(!up()||offline||recent())return;
 if(Date.now()-rt>ms*1.25||Date.now()-started>ms*5)wipe();else setTimeout(stalled,3000)
 }catch(e){}}
setTimeout(stalled,Math.round(ms*1.6));
setTimeout(function(){if(up())show('Coe is taking a while','This is slower than usual, so your connection may be weak. It is still trying. You can wait, press Reload, or Fix and reload.',last)},ms);
setTimeout(function(){if(up()&&shown)show('Coe is still not open','Something is holding it up. Press Fix and reload to clear the old saved files and start fresh.',last)},ms*2.5);
var seenErr=0;
var tk=setInterval(function(){
 try{
  if(ready()){clearInterval(tk);return}
  if(d.documentElement.id==='__next_error__'&&!seenErr){seenErr=1;failed('The page stopped while it was opening.');return}
  prog();place();if(shown&&cur&&up()&&!d.getElementById('coe-stuck'))draw(cur[0],cur[1],cur[2])
 }catch(e){}
},600);
/* the focus ring is for keyboard use only: it shows after Tab or the arrow keys, never after a click or while typing or sending */
d.addEventListener('keydown',function(e){var k=e.key;if(k==='Tab'||k==='ArrowUp'||k==='ArrowDown'||k==='ArrowLeft'||k==='ArrowRight')d.documentElement.setAttribute('data-kb','1');else if(k!=='Shift'&&k!=='Control'&&k!=='Alt'&&k!=='Meta'&&k!=='Escape')d.documentElement.removeAttribute('data-kb')},true);
d.addEventListener('pointerdown',function(){d.documentElement.removeAttribute('data-kb')},true);
/* menus, dropdowns and pop-ups grow out of the side their button is on (above, below, left or right), quickly */
(function(){var SEL='.cx-pop,.sel-list,[role="menu"],[role="listbox"]';
function aim(el){try{var t=d.querySelector('[aria-expanded="true"]'),r=el.getBoundingClientRect(),o='50% 50%';
 if(t&&r.width&&r.height){var b=t.getBoundingClientRect(),cx=b.left+b.width/2,cy=b.top+b.height/2,x=Math.min(100,Math.max(0,(cx-r.left)/r.width*100)),y=Math.min(100,Math.max(0,(cy-r.top)/r.height*100));
  if(cy<r.top)y=0;else if(cy>r.bottom)y=100;if(cx<r.left)x=0;else if(cx>r.right)x=100;o=Math.round(x)+'% '+Math.round(y)+'%'}
 el.style.transformOrigin=o}catch(e){}}
function scan(n){if(n.nodeType!==1)return;if(n.matches&&n.matches(SEL))aim(n);if(n.querySelectorAll){var q=n.querySelectorAll(SEL);for(var k=0;k<q.length;k++)aim(q[k])}}
function start(){new MutationObserver(function(ms){for(var i=0;i<ms.length;i++){var a=ms[i].addedNodes;for(var j=0;j<a.length;j++)scan(a[j])}}).observe(d.documentElement,{childList:true,subtree:true})}
if(d.documentElement)start();else d.addEventListener('DOMContentLoaded',start)})();
w.__coeHideStuck=function(){clearInterval(tk);var e=d.getElementById('coe-stuck');if(e&&e.parentNode)e.parentNode.removeChild(e)}
})();`;
