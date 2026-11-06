/**
 * A small script that runs before anything else on the page, written in old-fashioned JavaScript so that even a very old phone can run it.
 * Its job: if Coe does not open (a file did not arrive, the phone dropped its connection, an old copy of the site is stuck in the cache,
 * or the browser is too old for part of the code), say so in plain words and give buttons that fix it, instead of leaving a dead screen.
 */
export const BOOT_JS = `(function(){
var w=window,d=document,shown=0,last='',started=Date.now();
function ready(){try{return d.documentElement.className.indexOf('coe-ready')>-1}catch(e){return false}}
function up(){try{return !ready()&&(!!d.querySelector('.ld')||d.documentElement.id==='__next_error__')}catch(e){return false}}
function st(){var s=d.createElement('style');s.id='coe-stuck-css';s.textContent='#coe-stuck{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;padding:16px 16px calc(16px + env(safe-area-inset-bottom));background:#F2E4CE;color:#171717;border-top:4px solid #1A4934;font:16px/1.5 system-ui,sans-serif;box-shadow:0 -6px 0 #171717}#coe-stuck b{display:block;font-size:20px;line-height:1.2;margin-bottom:4px;text-transform:uppercase;letter-spacing:.02em}#coe-stuck p{margin:0 0 10px;max-width:60ch}#coe-stuck small{display:block;margin-top:8px;opacity:.7;font-size:12px;word-break:break-word}#coe-stuck button{font:inherit;font-weight:700;text-transform:uppercase;min-height:44px;padding:8px 16px;margin:0 8px 8px 0;color:#171717;background:#FBF6EC;border:3px solid #171717;box-shadow:3px 3px 0 #171717;cursor:pointer}#coe-stuck button.go{background:#337957;color:#F2E4CE}';d.head.appendChild(s)}
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
 e.innerHTML='<b></b><p></p><button class="go" type="button" id="coe-again">Try again</button><button type="button" id="coe-fix">Fix and reload</button><small></small>';
 e.getElementsByTagName('b')[0].textContent=title;e.getElementsByTagName('p')[0].textContent=text;e.getElementsByTagName('small')[0].textContent=why||'';
 (d.body||d.documentElement).appendChild(e);
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
 show(offline?'You are offline':'Coe could not open',offline?'Your phone has no connection right now. Turn Wi-Fi or mobile data back on, then press Try again.':old?'This browser looks too old for part of Coe. Updating iOS, Android or your browser usually fixes it. You can also press Fix and reload.':'Part of Coe did not arrive, often because the connection dropped. Press Try again. If it keeps happening, press Fix and reload.',why)
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
w.addEventListener('offline',function(){if(up())show('You are offline','Your phone has no connection right now. Turn Wi-Fi or mobile data back on, then press Try again.','')});
var ms=Number(w.__coeBootMs)||12000;
setTimeout(function(){if(up())show('Coe is taking a while','This is slower than usual, so your connection may be weak. It is still trying. You can wait, press Try again, or Fix and reload.',last)},ms);
setTimeout(function(){if(up()&&shown)show('Coe is still not open','Something is holding it up. Press Fix and reload to clear the old saved files and start fresh.',last)},ms*2.5);
var seenErr=0;
var tk=setInterval(function(){
 try{
  if(ready()){clearInterval(tk);return}
  if(d.documentElement.id==='__next_error__'&&!seenErr){seenErr=1;failed('The page stopped while it was opening.');return}
  if(shown&&cur&&up()&&!d.getElementById('coe-stuck'))draw(cur[0],cur[1],cur[2])
 }catch(e){}
},600);
w.__coeHideStuck=function(){clearInterval(tk);var e=d.getElementById('coe-stuck');if(e&&e.parentNode)e.parentNode.removeChild(e)}
})();`;
