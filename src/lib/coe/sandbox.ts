/**
 * Runs JavaScript Coe wrote, in a box with no way out: a frame with no access to this page, no network and no storage.
 * It reports what was printed and what the code returned. It is stopped after a few seconds.
 */
export interface RunResult { ok: boolean; log: string; value?: string; error?: string; timedOut?: boolean }

const lit = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const PAGE = (code: string, nonce: string, files: Record<string, string>) => `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'"><script>
(()=>{const out=[];const send=(m)=>parent.postMessage(Object.assign({coe:${lit(nonce)}},m),'*');
const show=(v)=>{if(typeof v==='string')return v;try{return typeof v==='undefined'?'undefined':JSON.stringify(v,(k,x)=>typeof x==='bigint'?x.toString()+'n':x instanceof Map?Object.fromEntries(x):x instanceof Set?[...x]:x,2)}catch(e){return String(v)}};
const log=(...a)=>{out.push(a.map(show).join(' '));if(out.join('\\n').length>20000)throw new Error('Too much output')};
const console={log,info:log,warn:log,error:log,debug:log,table:log};
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const __files=${lit(files)};const readFile=(p)=>{p=String(p).replace(/^\\.?\\/+/,'');if(!(p in __files))throw new Error('No file '+p);return __files[p]};const listFiles=()=>Object.keys(__files);
new AsyncFunction('console','readFile','listFiles',${lit(code)})(console,readFile,listFiles).then(v=>send({ok:true,log:out.join('\\n'),value:v===undefined?undefined:show(v)}),e=>send({ok:false,log:out.join('\\n'),error:String(e&&e.stack?e.stack.split('\\n').slice(0,3).join('\\n'):e)}));
addEventListener('error',e=>send({ok:false,log:out.join('\\n'),error:String(e.message)}));})();
<\/script>`;

export function runJs(code: string, ms = 10000, files: Record<string, string> = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const nonce = Math.random().toString(36).slice(2);
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts'); f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none';
    let done = false;
    const finish = (r: RunResult) => { if (done) return; done = true; clearTimeout(t); window.removeEventListener('message', on); f.remove(); resolve(r); };
    const on = (e: MessageEvent) => { if (e.source === f.contentWindow && e.data && e.data.coe === nonce) finish({ ok: !!e.data.ok, log: String(e.data.log ?? ''), value: e.data.value, error: e.data.error }); };
    const t = setTimeout(() => finish({ ok: false, log: '', error: 'It ran for more than ' + ms / 1000 + ' seconds, so it was stopped.', timedOut: true }), ms);
    window.addEventListener('message', on);
    f.srcdoc = PAGE(code, nonce, files);
    document.body.appendChild(f);
  });
}
