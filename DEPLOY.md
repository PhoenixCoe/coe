# Setting up Coe

Do parts 1 to 3 first. Part 4 (Stripe) can wait. Until it is done, Pro shows "Not on sale yet" and everyone is on Free.

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
5. Supabase > **Authentication > Notifications > Email > SMTP Settings**. Turn on custom SMTP. Sender email `no-reply@mail.pmcstudios.uk`, sender name `Coe`, host `smtp.resend.com`, port `465`, username `resend`, password = the Resend key. Save.
6. Supabase > **Authentication > Email Templates**. Open **Confirm sign up**, then **Magic link or OTP**. In each, add a line `Your code: {{ .Token }}` and Save. The email then shows a 6 digit code.
7. Supabase > **Settings > API Keys**. Copy the **publishable key** (starts `sb_publishable_`). The Project URL is `https://` + your project's reference ID + `.supabase.co`. The reference ID is the text after `/project/` in the dashboard's address bar (also under Project Settings > General > Reference ID). (If you only see the old keys, the **anon** key works the same.)
8. GitHub repository > **Settings > Secrets and variables > Actions > Variables** tab > **New repository variable**. Add `SUPABASE_URL` (the Project URL) and `SUPABASE_ANON_KEY` (the publishable or anon key). Add `COE_SERVER` in part 3.

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

## Handy switches (Worker variables, all optional)
- `PRO_EMAILS`: emails that get Pro without paying, comma separated. For you and testers. Put your own email here: Pro is what unlocks "My own key" in Settings > Your AI.
- `FREE_DAILY` (30), `PRO_DAILY` (300): credits a day.
- `REQUIRE_SIGNIN`: set to `1` so only signed-in people can chat.
- `ACCESS_CODE` (Secret): people need this word to use the server.

## How it works
- No account: Free. Credits are counted on that device.
- Signed in: credits are counted by the Worker, per account. Swift and Core cost 1. Deep costs 3. They reset at midnight UTC.
- Own key (Settings > Your AI): Pro only. Everyone else uses Coe's key from the Worker.
- Pro: only from paying (or `PRO_EMAILS`). Stripe tells the Worker, the Worker saves it, the site reads it.
- "Wrong? Redo free" costs nothing, up to 10 a day on Free and 30 on Pro.
- Past chats: on the device by default. Signed in: also saved in the account, so they follow you.

## If a key leaks
Delete it where it came from (OpenAI, Stripe or Supabase), make a new one, and update the Cloudflare secret.
