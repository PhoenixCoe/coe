# Setting up Coe

Do parts 1 to 3 first. Part 4 (Stripe) can wait. Until it is done, Pro shows "Not on sale yet" and everyone is on Free.

## 1. Put the site online (GitHub Pages)
1. Make a new GitHub repository. Upload this folder to it.
2. Repository > Settings > Pages > Source: **GitHub Actions**.
3. Where pmcstudios.uk is managed, add a DNS record: type `CNAME`, name `coe`, value `<your-github-name>.github.io`.
4. Settings > Pages > Custom domain: `coe.pmcstudios.uk`. Tick **Enforce HTTPS** when it lets you.

## 2. Accounts and saved chats (Supabase)
1. supabase.com > New project.
2. SQL Editor > New query. Paste all of `supabase/setup.sql`. Run.
3. Authentication > URL Configuration > Site URL: `https://coe.pmcstudios.uk`.
4. Supabase asks for your own email sender before it lets you edit emails. Do this once (free):
   - resend.com > make an account > **Domains > Add domain**: `mail.pmcstudios.uk`. Add the DNS records it shows, exactly, then press **Verify**.
   - Resend > **API Keys > Create API key** (Sending access). Copy it.
   - Supabase > Authentication > **Emails > SMTP Settings** > turn on custom SMTP. Sender email `no-reply@mail.pmcstudios.uk`, sender name `Coe`, host `smtp.resend.com`, port `465`, username `resend`, password = the Resend API key. Save.
5. Authentication > Emails > Templates (older dashboard: Email Templates). Open **Confirm sign up**, then **Magic link**. In each one, add a line `Your code: {{ .Token }}` to the message and Save. The email then shows a 6 digit code.
6. Project Settings > API. Copy the **Project URL** and the **anon public** key.
7. GitHub repository > Settings > Secrets and variables > Actions > **Variables** tab. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Push any change to rebuild.

## 3. The server (Cloudflare Worker)
1. Cloudflare > Workers & Pages > Create > Worker. Name it `coe-server`. Deploy.
2. Edit code. Replace everything with `worker/worker.js`. Deploy.
3. Worker > Settings > Variables and Secrets. Add these:

| Name | Type | Value |
| --- | --- | --- |
| `API_KEY` | Secret | your OpenAI key |
| `ALLOWED_ORIGINS` | Text | `https://coe.pmcstudios.uk` |
| `MODEL_SWIFT` | Text | optional. Leave empty to use `gpt-6-luna` |
| `MODEL_CORE` | Text | optional. Leave empty to use `gpt-6.1-terra` |
| `MODEL_DEEP` | Text | optional. Leave empty to use `gpt-6.1-sol` |
| `SUPABASE_URL` | Text | the Project URL from part 2 |
| `SUPABASE_ANON_KEY` | Text | the anon key from part 2 |
| `SUPABASE_SERVICE_KEY` | Secret | Supabase > Project Settings > API > **service_role** key |

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
