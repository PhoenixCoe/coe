import json
code=open('worker/worker.js').read()
head='/**\n * The Cloudflare Worker that holds the key. It is shown in Settings with a Copy button, so nobody has to find it in the project.\n * The key lives in the Worker as a secret, never in this site\'s code (this site is public). The same text is in worker/worker.js.\n */\n'
open('src/lib/coe/worker.ts','w').write(head+"export const WORKER_CODE = "+json.dumps(code)+";\n")
