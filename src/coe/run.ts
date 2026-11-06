/**
 * The Run button on JavaScript and Python code. The code runs in a worker inside a sandboxed frame, so it cannot touch
 * the page, your chats or your account, and Stop (or a time limit) ends it even if it never finishes.
 * Python is run by Pyodide, which is downloaded the first time (about 10 MB) and needs a connection.
 */
const PY = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
const FMT = `const fmt=(a)=>a.map(x=>{if(typeof x==='string')return x;if(x instanceof Error)return String(x.stack||x);try{return JSON.stringify(x,(k,v)=>typeof v==='bigint'?v+'n':typeof v==='function'?'[Function]':v,2)??String(x)}catch(e){return String(x)}}).join(' ');`;
const JS_WORKER = `${FMT}
console.log=console.info=console.debug=(...a)=>postMessage({k:'',t:fmt(a)});console.warn=(...a)=>postMessage({k:'w',t:fmt(a)});console.error=(...a)=>postMessage({k:'e',t:fmt(a)});
onmessage=async(e)=>{try{const AF=Object.getPrototypeOf(async function(){}).constructor;const r=await new AF(e.data.code)();if(r!==undefined)postMessage({k:'r',t:fmt([r])})}catch(err){postMessage({k:'e',t:String(err&&err.stack||err).split('\\n').slice(0,3).join('\\n')})}postMessage({k:'done'})};`;
const PY_WORKER = `importScripts('${PY}pyodide.js');let py;
onmessage=async(e)=>{try{postMessage({k:'s',t:'Loading Python. The first time takes a little while…'});py=py||await loadPyodide({indexURL:'${PY}'});py.setStdout({batched:(t)=>postMessage({k:'',t})});py.setStderr({batched:(t)=>postMessage({k:'e',t})});postMessage({k:'s',t:'Running…'});const r=await py.runPythonAsync(e.data.code);if(r!==undefined&&r!==null)postMessage({k:'r',t:String(r)})}catch(err){postMessage({k:'e',t:String(err&&err.message||err).trim().split('\\n').slice(-4).join('\\n')})}postMessage({k:'done'})};`;

const harness = (id: string, worker: string) => `<!doctype html><meta charset="utf-8"><script>
const ID=${JSON.stringify(id)};
try{const w=new Worker(URL.createObjectURL(new Blob([${JSON.stringify(worker)}],{type:'text/javascript'})));
w.onmessage=e=>parent.postMessage({coeRun:ID,...e.data},'*');w.onerror=e=>parent.postMessage({coeRun:ID,k:'e',t:(e.message||'The code could not start.')},'*');
addEventListener('message',e=>{if(e.data&&typeof e.data.run==='string')w.postMessage({code:e.data.run})});
parent.postMessage({coeRun:ID,k:'ready'},'*')}catch(err){parent.postMessage({coeRun:ID,k:'e',t:'This browser could not start the code runner.'},'*');parent.postMessage({coeRun:ID,k:'done'},'*')}
</script>`;

const LIMIT = { js: 15000, py: 120000 } as const;
let counter = 0;

/** Runs the code in a code block, showing its output in a panel just under it. */
export function runBlock(box: HTMLElement, lang: 'js' | 'py') {
  const code = box.querySelector('code')?.textContent ?? '';
  const old = box.nextElementSibling as (HTMLElement & { __stop?: () => void }) | null;
  if (old?.classList.contains('cx-run')) { old.__stop?.(); old.remove(); }
  const id = 'run' + ++counter;
  const panel = document.createElement('div') as HTMLElement & { __stop?: () => void };
  panel.className = 'cx-run';
  panel.innerHTML = '<div class="cx-run-top"><span class="d">Output</span><span class="cx-run-st tx" role="status"></span><span class="cx-grow"></span><button type="button" data-stop>Stop</button><button type="button" data-close>Close</button></div><pre class="cx-run-out" tabindex="0" aria-live="polite"></pre>';
  box.after(panel);
  const out = panel.querySelector<HTMLElement>('.cx-run-out')!, st = panel.querySelector<HTMLElement>('.cx-run-st')!, stop = panel.querySelector<HTMLButtonElement>('[data-stop]')!;
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1; frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = harness(id, lang === 'py' ? PY_WORKER : JS_WORKER);
  let timer = 0, finished = false, lines = 0;
  const end = (why?: string) => { if (finished) return; finished = true; window.clearTimeout(timer); window.removeEventListener('message', onMsg); frame.remove(); stop.disabled = true; st.textContent = why ?? 'Finished'; panel.classList.add('done'); if (!out.textContent) out.textContent = '(Nothing was printed.)'; };
  const line = (cls: string, t: string) => { if (lines++ > 500) return; const d = document.createElement('span'); if (cls) d.className = 'r-' + cls; d.textContent = t + '\n'; if (!out.firstChild || out.dataset.empty) { out.textContent = ''; delete out.dataset.empty; } out.appendChild(d); out.scrollTop = out.scrollHeight; };
  function onMsg(e: MessageEvent) {
    if (e.source !== frame.contentWindow || !e.data || e.data.coeRun !== id) return;
    const { k, t } = e.data as { k: string; t?: string };
    if (k === 'ready') { frame.contentWindow?.postMessage({ run: code }, '*'); st.textContent = lang === 'py' ? 'Starting Python…' : 'Running…'; }
    else if (k === 's') st.textContent = t ?? '';
    else if (k === 'done') end();
    else if (k === 'e') { line('e', t ?? ''); if (/could not (start|run)/i.test(t ?? '')) end('Could not run'); }
    else if (k === 'r') line('r', '→ ' + (t ?? '')); else if (k === 'w') line('w', t ?? ''); else line('', t ?? '');
  }
  window.addEventListener('message', onMsg);
  panel.__stop = () => end('Stopped');
  stop.addEventListener('click', () => { line('w', 'Stopped.'); end('Stopped'); });
  panel.querySelector('[data-close]')!.addEventListener('click', () => { end('Closed'); panel.remove(); });
  timer = window.setTimeout(() => { line('e', `Stopped: it ran for more than ${LIMIT[lang] / 1000} seconds.`); end('Timed out'); }, LIMIT[lang]);
  panel.appendChild(frame);
}
