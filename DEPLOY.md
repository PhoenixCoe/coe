# Setting up Coe

Do parts 1 to 3 first. Already set up from an earlier zip? You only need to upload the files (part 1, step 1) and paste `worker/worker.js` into the Worker again (part 3, step 2). Part 4 (Stripe) can wait. Until it is done, Pro shows "Not on sale yet" and everyone is on Free.

## 1. Put the site online (GitHub Pages)
1. Make a new GitHub repository. Upload this folder to it.
2. Repository > **Settings** > **Pages** (left menu, under "Code, planning, and automation") > Build and deployment > **Source: GitHub Actions**.
3. Where pmcstudios.uk is managed, add a DNS record: type `CNAME`, name `coe`, value `<your-github-name>.github.io`.
4. Settings > Pages > Custom domain: `coe.pmcstudios.uk`. Tick **Enforce HTTPS** when it lets you.

## 2. Accounts and saved chats (Supabase)
1. supabase.com/dashboard > **New project**.
2. **SQL Editor** > New query. Paste all of `supabase/setup.sql`. Run.
3. **Authentication > URL Configuration**. Site URL: `https://coe.pmcstudios.uk`. Redirect URLs > add `https://coe.pmcstudios.uk/**`. Save.
4. Supabase will only send sign-in emails from your own sender. Make one (free):
   - resend.com > **Domains** > add `mail.pmcstudios.uk`. Add the DNS records it shows, exactly, then press Verify.
   - Resend > **API keys** > create a key (name `Coe`, permission: sending access). Copy it now. It is only shown once.
5. Supabase > **Authentication > Notifications > Email > SMTP Settings**. Turn on custom SMTP. Sender email `coe@mail.pmcstudios.uk` (not no-reply: Resend flags no-reply addresses), sender name `Coe`, host `smtp.resend.com`, port `465`, username `resend`, password = the Resend key. Save.
6. Supabase > **Authentication > Email Templates**. Do this for **Confirm sign up**, then **Magic link or OTP**: set the **Subject heading** to `{{ .Token }} is your Coe code`, delete the message, paste in everything from `email/login-code.html`, and Save. The email then shows the PMC-style card with the 6 digit code. The pictures load from `https://coe.pmcstudios.uk/email/`, so deploy the site first.
   - Stop the emails landing in spam: in Resend, turn **open and click tracking off** for the domain. Add a DNS TXT record named `_dmarc` on `pmcstudios.uk` with the value `v=DMARC1; p=none;` (skip it if a `_dmarc` record is already there). Mark the first email **Not spam** once. New sending domains start with no reputation, so it settles after a few days.
7. Supabase > **Settings > API Keys**. Copy the **publishable key** (starts `sb_publishable_`). The Project URL is `https://` + your project's reference ID + `.supabase.co`. The reference ID is the text after `/project/` in the dashboard's address bar (also under Project Settings > General > Reference ID). (If you only see the old keys, the **anon** key works the same.)
8. GitHub repository > **Settings > Secrets and variables > Actions > Variables** tab > **New repository variable**. Add `SUPABASE_URL` (the Project URL) and `SUPABASE_ANON_KEY` (the publishable or anon key). Add `COE_SERVER` in part 3.

## 2b. PMC Account (the sign-in page at accounts.pmcstudios.uk)
Do this once. Until it is live, Coe and Coe Mini open on the emailed code by themselves, so nobody is locked out while you set it up.

Supabase:
1. **SQL Editor** > New query. Paste all of `supabase/setup.sql`. Run. (Running it again is safe. It adds the new list of sites an account has used.)
2. **Authentication > Sign In / Providers > Email**. Make sure: **Confirm email** is on, **Minimum password length** is `10`, **Require current password when updating** is on, and **Require reauthentication when changing password** is on. Also switch **Google** off (and any other provider that is on): Coe does not use it any more. Save. (If a label is not there, Supabase renamed it: use the search box at the top.)
3. **Authentication > URL Configuration** > Redirect URLs > add `https://accounts.pmcstudios.uk/**`. Save.
4. **Authentication > Emails** (Email Templates). For each one, set the Subject, delete the body, paste in the file from `email/`, Save:
   - **Confirm sign up**: subject `{{ .Token }} is your PMC Account code`, body `confirm-signup.html`
   - **Reset password**: subject `{{ .Token }} is your PMC Account reset code`, body `reset-code.html`
   - **Reauthentication**: subject `{{ .Token }} is your PMC Account confirm code`, body `reauth-code.html`

GitHub:
5. github.com > **New repository**. Name `pmc-accounts`. Public. Tick nothing else. **Create repository**.
6. Put the files in it: tell Claude "created it" and it uploads them. Or drag the whole `pmc-accounts` folder contents into the repo page (Add file > Upload files), including the `.github` folder, and **Commit**.
7. Repo > **Settings > Secrets and variables > Actions > Variables > New repository variable**. Add `SUPABASE_URL` (the same Project URL Coe uses) and `SUPABASE_ANON_KEY` (the same publishable key Coe uses). Never the secret key: the publish step stops if it sees one.
8. Repo > **Settings > Pages** > Source: **GitHub Actions**.
9. **Actions** tab > **Deploy PMC Account** > **Run workflow**. Wait for the green tick. If it goes red, the message says which setting is wrong.
10. Where pmcstudios.uk is managed, add a DNS record: type `CNAME`, name `accounts`, value `phoenixcoe.github.io`.
11. Repo > Settings > Pages > Custom domain: `accounts.pmcstudios.uk` > Save. When it lets you, tick **Enforce HTTPS**. This can take up to an hour.
12. Check it. In the `pmc-accounts` folder run `node check-setup.mjs`. It reads your live settings and prints what, if anything, still needs fixing. Last, open `accounts.pmcstudios.uk`, make an account, then press **Sign in with PMC** in Coe.

## 3. The server (Cloudflare Worker)
1. dash.cloudflare.com > **Workers & Pages** > **Create** (or **Create application**) > **Start with Hello World!** > **Get started**. Name it `coe-server`. Press **Deploy**, then **Continue to project**.
2. Press **Edit code** (top of the page). Delete everything in the editor, paste all of `worker/worker.js`, press **Deploy**.
3. Worker > **Settings** > **Variables and Secrets** > **Add**. Pick the type (Text or Secret), type the name and value, then press **Deploy**. Add these:

| Name | Type | Value |
| --- | --- | --- |
| `API_KEY` | Secret | your OpenAI key |
| `ALLOWED_ORIGINS` | Text | `https://coe.pmcstudios.uk` |
| `MODEL_SWIFT` | Text | optional. Leave empty to use `gpt-6-luna` |
| `MODEL_CORE` | Text | optional. Leave empty to use `gpt-6.1-terra` |
| `MODEL_DEEP` | Text | optional. Leave empty to use `gpt-6.1-sol` |
| `SUPABASE_URL` | Text | the Project URL from part 2 |
| `SUPABASE_ANON_KEY` | Text | the publishable (or anon) key from part 2 |
| `SUPABASE_SERVICE_KEY` | Secret | Supabase > Settings > API Keys > the **secret key** (starts `sb_secret_`), or the old **service_role** key. Never put it in GitHub. |
| `MODEL_SEARCH` | Text | optional. The model that does web searches. Leave empty to use the Core model |
| `MODEL_IMAGE` | Text | optional. Leave empty to use `gpt-image-2.5-flare` |
| `MODEL_TRANSCRIBE` | Text | optional. Voice in (and audio or video files). Leave empty to use `gpt-transcribe` (it falls back to `gpt-4o-mini-transcribe`) |
| `MODEL_AUDIO` | Text | optional. The model that listens in the Sound lab and names instruments and noises. Leave empty to use `gpt-audio-mini` |
| `RESEND_API_KEY` | Secret | optional. Emails written feedback to contact@pmcstudios.uk. See part 5. |
| `MAIL_URGENT` | Text | optional. Reports and "something is wrong" emails are marked urgent. Type `all` to mark every email, or `off` to mark none. |
| `GOOGLE_PLACES_KEY` | Secret | optional. Adds photos, ratings, phone numbers and websites to the business cards on maps. See part 9. Without it, maps still work through OpenStreetMap |

4. Copy the Worker address (like `https://coe-server.yourname.workers.dev`). GitHub repository > Settings > Secrets and variables > Actions > **Variables** > add `COE_SERVER` with that address. Then Actions > Deploy to GitHub Pages > **Run workflow**. Visitors never have to paste it.
5. OpenAI dashboard: set a monthly spending limit.

Never put `API_KEY`, `SUPABASE_SERVICE_KEY` or any Stripe key in the site, in GitHub, or in a chat. They only go in Cloudflare as **Secret**.

## 4. Take payments (Stripe)
Use Stripe's **test mode** first. Switch to live at the end.
1. stripe.com > create an account.
2. Product catalogue > Add product `Coe Pro`. Add two recurring prices: **$10 monthly** and **$110 yearly**. Copy both price ids (they start `price_`).
3. Developers > API keys. Copy the **Secret key** (starts `sk_`).
4. Developers > Webhooks > Add endpoint.
   - URL: `https://<your-worker-address>/stripe`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the **Signing secret** (starts `whsec_`).
5. Settings > Billing > Customer portal > turn it on. This is what "Manage plan" opens.
6. Cloudflare Worker > add:

| Name | Type | Value |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Secret | the `sk_` key |
| `STRIPE_WEBHOOK_SECRET` | Secret | the `whsec_` key |
| `STRIPE_PRICE_PRO_MONTH` | Text | the monthly `price_` id |
| `STRIPE_PRICE_PRO_YEAR` | Text | the yearly `price_` id |

7. Test: sign in on the site > Plans > Get Pro > card `4242 4242 4242 4242`, any future date, any CVC. Pro turns on within a few seconds.
8. Go live: repeat steps 2 to 6 with live mode keys and ids.

## 5. Feedback emails to contact@pmcstudios.uk (optional, free tier is enough)
Messages people write in Coe (Settings > About > Tell us something, and the box after a Bad or Fine face) are emailed to contact@pmcstudios.uk. Without this part Coe still works: the person gets a button that opens their own email app instead.
1. resend.com > make a free account > **Domains** > **Add Domain** > `pmcstudios.uk` > add the DNS records it shows in Cloudflare (DNS > Records) > **Verify**.
2. Resend > **API Keys** > **Create API Key** (permission: Sending access) > copy it.
3. Cloudflare Worker > **Settings** > **Variables and Secrets** > **Add**: type **Secret**, name `RESEND_API_KEY`, paste the key > **Deploy**.
4. Optional: add a **Text** variable `MAIL_FROM` = `Coe <coe@pmcstudios.uk>` (must be on the domain you verified).
5. Test: Coe > Settings > About > Tell us something > write a line > Send. It should reach contact@pmcstudios.uk in a few seconds, laid out in the Coe style. Every email Coe sends goes to contact@pmcstudios.uk.

## 7. Coe using PMC Apps
Coe opens apps from `https://apps.pmcstudios.uk` inside the chat. Deploy the new PMC Apps build from this delivery first, because it contains the small piece that lets Coe drive an app. Without it the apps still open, but Coe cannot press their buttons. Free gets 5 runs a day in Coe, Pro is unlimited. The apps site itself stays free and AI-free.

## 9. Business photos and ratings on maps (optional, Google Places)
Coe makes maps and business cards without this, using OpenStreetMap. This adds photos, star ratings, phone numbers and websites. Google charges for it after a free monthly amount, so set a budget alert.
1. console.cloud.google.com > pick or make a project. Turn on billing for it (Google needs a card on file, even for the free amount).
2. **APIs & Services > Library** > search **Places API (New)** > **Enable**.
3. **APIs & Services > Credentials > Create credentials > API key**. Open the key > **API restrictions** > **Restrict key** > tick only **Places API (New)** > Save. (Leave website restrictions off: the key lives on the Worker, not on the site.)
4. Cloudflare Worker > Settings > Variables and Secrets > Add > type **Secret**, name `GOOGLE_PLACES_KEY`, paste the key > **Deploy**.
5. Cloud Billing > **Budgets & alerts** > make a budget (for example £10 a month) so you get an email if it climbs. The Worker already limits look-ups: Free 12 a day, Pro 400.

## 12. Getting the audio parts working (a short checklist)
**Audio (voice typing, Sound lab).** They all run through your Worker and your OpenAI key, so there is nothing else to switch on.
1. platform.openai.com > Billing: the account needs a payment method and some credit. (A key without credit gets errors on every audio call.)
2. Cloudflare Worker > Settings > Variables and Secrets: `API_KEY` must be your OpenAI key (Secret). Leave `MODEL_TRANSCRIBE` and `MODEL_AUDIO` empty unless you want to change a model.
3. Try it: press the microphone on the chat bar and talk. Then Ctrl+K > Sound lab and drop in a song.

**Voice on a Mac.** Safari and Chrome on a Mac ask for the microphone once. If you pressed Block: click the lock in the address bar and allow the microphone. If it still does not work: Apple menu > System Settings > Privacy & Security > Microphone > tick your browser. Tap anywhere on the page once before Coe talks, because Safari only plays sound after a tap.

## 10. If Coe will not open on someone's phone
Coe now fixes most of these by itself. When a file does not arrive it clears the old saved copy and tries once more, and if that fails it shows a box with **Try again** and **Fix and reload** instead of a blank page. A very slow connection shows "Coe is taking a while". The most common real cause was an old iPhone (iOS 16.3 or older) that could not read one line of code. That line is now guarded. Phones older than about iOS 14 can still struggle. Offline, the saved copy opens after 4.5 seconds.

## 11. Run the checks (optional, on a computer with Node 20+)
`npm install`, then `npm test` checks the feature list is over 75 and has no duplicates. `npx tsc --noEmit` checks the types.

## 8. Update the database (do this once if you already ran setup.sql before)
Supabase > SQL Editor > paste all of `supabase/setup.sql` again and run. It only adds what is missing: the `profiles` table (notes, study decks, your own styles) and the `shares` table with its `get_share` function (shared chat links). Without the shares part, everything else works; only "Share as a link" fails.

## Handy switches (Worker variables, all optional)
- `PRO_EMAILS`: emails that get Pro without paying, comma separated. For you and testers. Put your own email here: Pro is what unlocks "My own key" in Settings > Your AI.
- `FREE_DAILY_TOKENS` (120000), `PRO_DAILY_TOKENS` (2000000): tokens a day for a signed-in person. A short chat answer is about 1,000 to 6,000 tokens, so Free is roughly 20 chats and Pro 1,000 or more. Change them whenever you like.
- `ANON_DAILY_TOKENS` (50000): tokens a day for someone who is not signed in, per network. (`ANON_IP_DAILY` from older zips is no longer used. You can delete it.)
- `REDO_FREE` (3), `REDO_PRO` (10): "Wrong? Redo" presses a day that cost no tokens. After that a redo counts like any message.
- `CHECK_FREE` (10), `CHECK_PRO` (60): free "double-check my answer" passes a day.
- `APPS_FREE` (5): PMC App runs a day on Free.
- `REQUIRE_SIGNIN`: set to `1` so only signed-in people can chat.
- `OWNER_EMAILS`: your email (commas between several). It shows the owner tools in Settings. Checked on the server from the signed-in account.
- `BANNED`: emails to ban (commas, spaces or new lines). A banned person can sign in and see why, but cannot ask for or make anything.
- `FEEDBACK_BONUS` (50000, highest 100000): extra tokens, once a day, for answering "How am I doing?" or sending a message.
- `EXTENSION_IDS`: the store IDs of Coe Mini, comma separated (Chrome and Edge each give their own). Needed once a store has approved it. Leave `REQUIRE_SIGNIN` off while the stores review it.
- `ACCESS_CODE` (Secret): people need this word to use the server.

## How it works
- Everything is counted in **tokens** (the pieces of words the AI reads and writes), so the number you see is what was used. Free signed-in: 120,000 a day. Pro: 2,000,000 a day. Not signed in: 50,000 a day per network. They reset at midnight UTC. A bar in the sidebar shows what is left, and a banner appears at the top of the chat when more than 90% is used.
- Coe Swift and Core count normally. Coe Deep counts double. A web search costs about 18,000 tokens and a picture about 30,000.
- Giving feedback ("How am I doing?") quietly adds 20,000 tokens for that day. Nothing in the app says so.
- Small daily allowances, counted apart from tokens: Free gets 1 Deep Work run, 3 web searches, 2 pictures, 12 business look-ups, 3 Sound lab listens and 5 PMC App runs. Pro gets 200, 100, 40, 400, 60 and no limit.
- Pro only: long replies, big files (up to 24 MB), zip/PowerPoint/Excel files in, the project folder, your own key.
- Web search uses OpenAI's web search tool through the Worker. Pictures use `gpt-image-2.5-flare`. OpenAI may ask you to verify your organisation before image models work (platform.openai.com > Settings > Organization > General).
- Voice typing: the mic button on the chat bar types what you say. It uses the Worker (speech to text) with your OpenAI key, so there is nothing to set up. Coe does not talk back.
- Sound and video files: attach an mp3, m4a, wav or webm and Coe types out what was said (with time stamps). Attach a video and Coe reads a few frames as pictures and types out the soundtrack. Free listens to about 6 minutes, Pro to 40. Each piece of about 3 minutes uses one voice turn.
- Maths: any equation, in LaTeX, is drawn properly, including chemistry (`\ce{H2O}`). Click an equation to copy its LaTeX. The maths keyboard (the Σ button) builds one with buttons and a live preview. Coe checks sums with a real maths engine instead of guessing.
- Study: flash cards and quiz answers can be saved to Study (header button). Cards come back on a spaced schedule (again, hard, good, easy), with a streak, points and levels. Decks follow the account when signed in, and can be exported or imported as a file.
- Slide decks: Coe can make a deck in the chat. Press Present for full screen (arrow keys, N for notes), or Save .pptx for PowerPoint. Tables of data can be sorted, totalled, charted and saved as CSV.
- Run button: on JavaScript and Python code in a reply. It runs in a sealed box on the visitor's device, with a time limit. Python loads from the jsDelivr CDN the first time (about 10 MB).
- My styles: Style > Write your own style. Your own ways of working are kept on the device and in the account.
- Share as a link: the share button in the header (or Ctrl+K > Share). It makes a read-only copy of one chat's words (no pictures or files) at `/share/#...`. Pages in it only run if the reader presses Show. The owner can stop sharing at any time. Needs the shares part of `setup.sql`.
- Install as an app: Ctrl+K > Install Coe as an app (or the browser's install button). Chats and Study open offline; chatting needs a connection. The site's `sw.js` only caches files from the same site and always fetches pages fresh when online.
- Look: Settings > Look has colour, text size, animations (full, calm, off), compact and easy-read spacing, click sounds and the Enter key. Click sounds are off by default. Settings > About lists everything Coe can do.
- Also in replies: interactive graphs (drag and zoom), quizzes with a score, flash cards, charts, live pages, games, music and animation pages. Ctrl+K opens a command list. Typing `/` in the message box lists shortcuts. "Style" picks tutor, maths mentor, examiner, coder and more. Chats save as Markdown, a web page, or PDF (from the print box).
- Own key (Settings > Your AI): Pro only. Everyone else uses Coe's key from the Worker.
- Pro: only from paying (or `PRO_EMAILS`). Stripe tells the Worker, the Worker saves it, the site reads it.
- "Wrong? Redo" is free (no tokens) up to 3 a day on Free and 10 on Pro, and is refused when the tokens have run out.
- Past chats: on the device by default. Signed in: also saved in the account, so they follow you.

## If a key leaks
Delete it where it came from (OpenAI, Stripe or Supabase), make a new one, and update the Cloudflare secret.
