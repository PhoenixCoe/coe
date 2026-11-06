# Coe (coe.pmcstudios.uk)

One chat. It helps with study questions, checks code, and keeps your past chats in the sidebar.
Next.js 15, React 19, TypeScript, built as a static site. Part of PMC Studios, with its own colours.

## Look at it on your computer
Needs Node.js 20 or newer.

```bash
npm install
npm run dev
```
Open http://localhost:3000. For the built site: `npm run build:static`, then `npx serve out`.

## What runs where
- **Code check** runs on the visitor's device for JavaScript, TypeScript, JSON, HTML, CSS, Python and SQL. No key, no connection.
- **Chat and "Ask Coe"** use OpenAI through a small Cloudflare Worker that holds the key (see DEPLOY.md). The key is never in this site.
- **Past chats** are saved on the device by default. If Supabase is set up, people can sign in with an email code and their chats follow them.
- **Tokens and Pro** are counted by the Worker per account (what the AI really read and wrote, not a flat price per message). Pro is bought with Stripe. With no account, a visitor is on Free. See DEPLOY.md.
- **Everyone uses Coe's own key** (the Worker). **Pro members** can also use a key of their own (OpenAI, Anthropic, Google, OpenRouter, Groq, Mistral, DeepSeek, xAI, Ollama or any other address you paste in) from Settings > Your AI. Free and signed-out people cannot: a saved key is ignored and the Worker is used. Own keys go straight from the browser to the company, saved on that device only.

## Files
- `src/coe/` the screens (chat, Study, slides, tables, Share, Code check, account, plans, settings)
- `src/check/` the Code check engine
- `src/lib/coe/` models, plans, settings, the server connection, `study.ts` (spaced repetition), `personas.ts`, `pwa.ts` and `cloud.ts` (Supabase)
- `public/sw.js`, `public/manifest.webmanifest` install-as-an-app support
- `worker/worker.js` the Cloudflare Worker (key, tokens, Stripe, sound listening, business look-ups)
- `supabase/setup.sql` the database tables
- `src/ui/Player.tsx` the PMC audio player. `src/ui/Loader.tsx` the loading screen. `src/lib/coe/boot.ts` the small script that rescues a page that will not open
- `tests/features.test.mjs` run with `npm test`
- `src/ui/Mark.tsx` the logo: wordmark and the spinning star
