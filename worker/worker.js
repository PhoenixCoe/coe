// Coe server: a Cloudflare Worker. It keeps your OpenAI key secret, counts tokens, and sells Pro through Stripe.
//
// 1. In Cloudflare, create a Worker and paste this file in.
// 2. Settings > Variables and Secrets, add:
//      API_KEY                (secret)  your OpenAI key
//      ALLOWED_ORIGINS        (text)    https://coe.pmcstudios.uk
//      MODEL_SWIFT / MODEL_CORE / MODEL_DEEP  (text, optional)  default gpt-6-luna / gpt-6.1-terra / gpt-6.1-sol
//      ACCESS_CODE            (secret, optional)  people without it are turned away
//    For accounts, credits and Pro (all optional, see DEPLOY.md):
//      SUPABASE_URL, SUPABASE_ANON_KEY   (text)   the anon key or the newer publishable key
//      SUPABASE_SERVICE_KEY              (secret)  lets the Worker count tokens. Never put this in the site.
//      STRIPE_SECRET_KEY                 (secret)
//      STRIPE_WEBHOOK_SECRET             (secret)
//      STRIPE_PRICE_PRO_MONTH, STRIPE_PRICE_PRO_YEAR  (text)  price ids from Stripe
//      FREE_DAILY (40), PRO_DAILY (500), ANON_IP_DAILY (500)  (text, optional)
//      MODEL_SEARCH, MODEL_IMAGE  (text, optional)  the model used for web search and for pictures
//      APPS_FREE (5)  PMC App runs a day on Free. Pro is unlimited.
//      PRO_EMAILS                        (text, optional)  emails that get Pro without paying, comma separated. For you, for testing.
//      REQUIRE_SIGNIN                    (text, optional)  set to 1 so only signed-in people can chat
//      RESEND_API_KEY (secret), MAIL_FROM  (optional)  emails feedback and reports to contact@pmcstudios.uk, laid out in the Coe style. MAIL_FROM must be on a domain you verified in Resend.
//      MAIL_URGENT  (text, optional)  reports and "something is wrong" are marked urgent. Set to all to mark every email, or off to mark none.
// 3. Deploy, then paste the Worker's address into Coe > Settings.

const MOST = 16000;              // the longest reply it will ever ask for
const EXTRA = 1500;              // room for the model's own thinking, which counts against the limit
const EXTRA_WORK = 12000;        // Deep Work thinks for longer
const BIGGEST = { free: 4000000, pro: 24000000 };   // the largest request it will read, in bytes
const TIERS = { swift: "MODEL_SWIFT", core: "MODEL_CORE", deep: "MODEL_DEEP" };
const DEFAULTS = { swift: "gpt-6-luna", core: "gpt-6.1-terra", deep: "gpt-6.1-sol" };
// Everything is counted in tokens (the pieces of words a model reads and writes), so what you see is what is used.
const WEIGHT = { swift: 1, core: 1, deep: 2 };        // the biggest model counts double
const COST_SEARCH = 18000, COST_IMAGE = 30000;        // a web search and a picture, in tokens
const REPLY = { free: 2048, pro: 16000, work: 24000 };   // longest reply by plan
// Things a day that need Pro, with a small taste on Free. Counted separately from tokens.
const QUOTA = { work: { free: 1, pro: 200 }, search: { free: 3, pro: 100 }, image: { free: 2, pro: 40 }, app: { free: 5, pro: 100000 }, voice: { free: 24, pro: 3000 }, places: { free: 12, pro: 400 }, hear: { free: 3, pro: 60 } };
const REDO = { free: 3, pro: 10 };                     // free "wrong? redo" a day (REDO_FREE / REDO_PRO change it). After that a redo counts like any message.
const FEEDBACK_BONUS = 50000;                           // extra tokens for the day, once a day, for answering "How am I doing?" or sending a message (FEEDBACK_BONUS changes it, never above 100000). It is shown in Settings > Usage.
const CHECK = { free: 10, pro: 60 };                   // free "double-check my answer" passes a day (CHECK_FREE / CHECK_PRO change it)

const num2 = (n) => Number(n).toLocaleString("en-GB");
const json = (status, data, extra = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...extra } });
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

async function sha(text) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// A reply that goes wrong is paid back. Every charge is remembered under a call id that only this server can work out (and a receipt only it can sign), so a refund can never be more than what was charged, and never twice.
const REFUND_SHARE = 0.5;        // at most this much of a day's tokens can come back as refunds, so a refund can never be a free ride
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("coe-receipt|" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

const EXTENSION_IDS = ["ahmngjbjogpihonafedkcmhllmbccboa", "coe-mini@pmcstudios.uk"];   // Coe Mini: the Chrome-based id, and the Firefox id

// ---- Email to the Coe team. Every email Coe sends goes to contact@pmcstudios.uk, through Resend, laid out in the Coe style.
const MAIL_TO = "contact@pmcstudios.uk";
const SITE = "https://coe.pmcstudios.uk";
const escH = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FACE = { good: ["Good", "#337957", "#F2E4CE"], fine: ["Fine", "#B49A57", "#171717"], bad: ["Not good", "#B3392B", "#F2E4CE"] };
/** One email in the Coe look, kept plain so it reads quickly: the logo, a green title bar, one line that says which app, which version and what kind it is, then the message, then what is needed to answer it.
 *  o.app is "web" or "mini". o.tag is [short word, colour] (an idea, a problem, a reason). o.chips are small extras (a mood). o.lines is a short piece of the chat, as [who, text] pairs. o.action is [label, link]. */
function coeMail(o) {
  const font = "'PMC Symbols L4','PMC Font','Arial',Helvetica,sans-serif", head = "'PMC Symbols L2','PMC Header','Arial Black',Impact,Arial,sans-serif";
  const hot = !!o.tag && o.tag[1] === "#B3392B";
  const parts = [{ t: o.app === "mini" ? "Coe Mini" : "Coe website", c: "#171717" }, o.ver ? { t: o.ver, c: "#1A4934" } : null, o.tag ? { t: o.tag[0], c: hot ? "#B3392B" : "#1A4934" } : null, ...(o.chips || []).map((c) => ({ t: c[0], c: "#1A4934" }))].filter(Boolean);
  const strip = '<tr><td style="padding:20px 26px 6px 26px;font-family:' + head + ';font-size:20px;line-height:1.3;letter-spacing:1px;text-transform:uppercase;">'
    + parts.map((p) => '<span style="color:' + p.c + ';">' + escH(p.t) + "</span>").join(' <span style="color:#B49A57;">&middot;</span> ') + "</td></tr>";
  const text = '<tr><td style="padding:10px 26px 20px 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:4px solid #337957;padding:2px 0 2px 16px;font-family:' + font + ';font-size:17px;line-height:1.55;color:#171717;word-break:break-word;">'
    + (o.message ? escH(o.message).replace(/\r?\n/g, "<br>") : '<span style="color:#6B6B6B;">No note was written.</span>') + "</td></tr></table></td></tr>";
  const chat = o.lines && o.lines.length ? '<tr><td style="padding:0 26px 20px 26px;"><div style="padding:0 0 6px 0;font-family:' + head + ';font-size:11px;line-height:1.3;letter-spacing:1px;text-transform:uppercase;color:#1A4934;">The last few messages</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-left:2px solid #D8C6A6;padding:0 0 0 14px;font-family:' + font + ';font-size:14px;line-height:1.5;color:#3A3A3A;word-break:break-word;">'
    + o.lines.map((l) => '<div style="padding:0 0 7px 0;"><span style="font-family:' + head + ';font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#1A4934;">' + escH(l[0]) + "</span> " + escH(l[1]).replace(/\r?\n/g, "<br>") + "</div>").join("") + "</td></tr></table></td></tr>" : "";
  const button = (label, href) => '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#B49A57" style="background:#B49A57;border:3px solid #171717;"><a href="' + escH(href) + '" style="display:block;padding:10px 18px 8px 18px;font-family:' + head + ';font-size:16px;line-height:1;letter-spacing:1px;text-transform:uppercase;color:#171717;text-decoration:none;">' + escH(label) + "</a></td></tr></table>";
  const mail = o.reply ? "mailto:" + o.reply + "?subject=" + encodeURIComponent(o.replySubject || "Re: your message to Coe") : "";
  const who = o.reply ? (o.reply.length > 30 ? o.reply.slice(0, 29) + "…" : o.reply) : "";
  const buttons = o.action || o.reply ? '<tr><td style="padding:0 26px 22px 26px;font-family:' + font + ';font-size:14px;line-height:1.5;">' + (o.action ? button(o.action[0], o.action[1]) + (o.reply ? '<div style="padding-top:12px;"><a href="' + escH(mail) + '" style="color:#1A4934;">Reply to ' + escH(who) + "</a></div>" : "") : button("Reply to " + who, mail)) + "</td></tr>" : "";
  const rows = (o.rows || []).filter((r) => r[1]).map((r) => '<span style="color:#1A4934;">' + escH(r[0]) + "</span> " + (r[2] ? '<a href="' + escH(r[1]) + '" style="color:#1A4934;">' + escH(r[1]) + "</a>" : escH(r[1]))).join("<br>");
  const small = rows ? '<tr><td style="padding:0 26px 22px 26px;"><div style="border-top:2px solid #D8C6A6;padding-top:12px;font-family:' + font + ';font-size:13px;line-height:1.7;color:#4A4A4A;word-break:break-word;">' + rows + "</div></td></tr>" : "";
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><title>' + escH(o.subject) + '</title>'
    + "<style>@font-face{font-family:'PMC Font';src:url(" + SITE + "/fonts/PMCFont.woff2) format('woff2');}@font-face{font-family:'PMC Header';src:url(" + SITE + "/fonts/PMCHeader.woff2) format('woff2');}@font-face{font-family:'PMC Symbols L2';src:url(" + SITE + "/fonts/PMCSymbolsL2.woff2) format('woff2');unicode-range:U+0022,U+0023,U+0024,U+0025,U+0026,U+0027,U+002A,U+003C,U+003E,U+003F,U+0040,U+005B,U+005D,U+005E,U+005F,U+0060,U+007B,U+007C,U+007D,U+007E,U+00A1,U+00A3,U+00A9,U+00AB,U+00AE,U+00B0,U+00B1,U+00B7,U+00BB,U+00BF,U+00D7,U+00F7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+2190,U+2191,U+2192,U+2193,U+2212,U+2713;}@font-face{font-family:'PMC Symbols L4';src:url(" + SITE + "/fonts/PMCSymbolsL4.woff2) format('woff2');unicode-range:U+0022,U+0023,U+0024,U+0025,U+0026,U+0027,U+002A,U+003C,U+003E,U+003F,U+0040,U+005B,U+005D,U+005E,U+005F,U+0060,U+007B,U+007C,U+007D,U+007E,U+00A1,U+00A3,U+00A9,U+00AB,U+00AE,U+00B0,U+00B1,U+00B7,U+00BB,U+00BF,U+00D7,U+00F7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+2190,U+2191,U+2192,U+2193,U+2212,U+2713;}</style></head>"
    + '<body style="margin:0;padding:0;background:#171717;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;">' + escH(o.preheader || "") + "</div>"
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#171717" style="background:#171717;"><tr><td align="center" style="padding:28px 14px;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">'
    + '<tr><td bgcolor="#171717" style="padding:0 0 18px 0;"><img src="' + SITE + '/email/logo.png" width="90" height="44" alt="Coe" style="display:block;border:0;"></td></tr>'
    + '<tr><td bgcolor="#F2E4CE" style="background:#F2E4CE;border:4px solid #337957;padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
    + '<tr><td bgcolor="#337957" style="background:#337957;padding:16px 26px;font-family:' + head + ';font-size:22px;font-weight:bold;color:#F2E4CE;text-transform:uppercase;"><img src="' + SITE + "/email/" + o.titleImg + '.png" width="' + o.titleW + '" height="36" alt="' + escH(o.title) + '" style="display:block;border:0;color:#F2E4CE;font-size:22px;"></td></tr>'
    + strip + text + chat + buttons + small
    + "</table></td></tr>"
    + '<tr><td style="padding:18px 4px 0 4px;font-family:' + font + ';font-size:12px;line-height:1.5;color:#B49A57;"><a href="' + SITE + '" style="text-decoration:none;"><img src="' + SITE + '/email/pmc.png" width="64" height="36" alt="PMC Studios" style="display:block;border:0;color:#B49A57;"></a></td></tr>'
    + "</table></td></tr></table></body></html>";
}
/** Sends one email to the team. Resolves to whether Resend took it.
 *  An urgent one (a report, or something wrong) is flagged high priority, and its subject starts with [Urgent], because Gmail ignores the flag. MAIL_URGENT: "all" flags every email, "off" flags none. */
async function mailTeam(env, o) {
  if (!env.RESEND_API_KEY) return false;
  const mode = String(env.MAIL_URGENT || "").trim().toLowerCase(), urgent = mode === "all" || (mode !== "off" && !!o.urgent);
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "User-Agent": COE_UA, authorization: "Bearer " + String(env.RESEND_API_KEY).trim(), "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "Coe <coe@pmcstudios.uk>", to: [MAIL_TO], reply_to: o.reply || undefined, subject: (urgent ? "[Urgent] " : "") + o.subject, html: coeMail(o), text: o.plain,
      headers: urgent ? { "X-Priority": "1 (Highest)", "Importance": "high", "Priority": "urgent" } : undefined }) }).catch(() => null);
  return !!r?.ok;
}

// Every request this server makes to another website says who is asking (some sites turn away anything that does not).
const COE_UA = "Coe/1.0 (+https://coe.pmcstudios.uk; contact@pmcstudios.uk)";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    // The Coe Chrome sidebar is allowed too. Its address never changes (the key in its manifest fixes it), so nothing needs adding in Cloudflare.
    const extIds = [...EXTENSION_IDS, ...(env.EXTENSION_IDS || "").split(",").map((s) => s.trim()).filter(Boolean)];
    // Firefox gives every install its own random address (moz-extension://...), so there the extension says who it is in a header instead (the check-ahead request cannot carry it, so that one is let through).
    const fromExt = origin
      ? (origin.startsWith("chrome-extension://") && extIds.includes(origin.slice(19))) || (origin.startsWith("moz-extension://") && (request.method === "OPTIONS" || extIds.includes(request.headers.get("x-coe-ext") || "")))
      : extIds.includes(request.headers.get("x-coe-ext") || "");
    const okOrigin = allowed.includes(origin) || fromExt;
    const cors = {
      "Access-Control-Allow-Origin": origin && okOrigin ? origin : "null",
      "Access-Control-Allow-Headers": "content-type, x-coe-code, x-coe-redo, x-coe-step, x-coe-check, x-coe-lang, x-coe-ext, x-coe-call, x-coe-test, authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Expose-Headers": "x-coe-used, x-coe-limit, x-coe-plan",
      "Vary": "Origin",
    };
    const reply = (status, data, extra) => json(status, data, { ...cors, ...extra });
    const fail = (status, message, code) => reply(status, { error: { message, ...(code ? { code } : {}) } });
    // What went wrong for the owner goes to the Cloudflare log. People using Coe only ever see a plain sentence.
    const note = (why) => { try { console.error("[coe owner] " + why); } catch { /* none */ } };
    const keyMsg = () => { note("The AI key was refused. Check the API_KEY variable in Cloudflare."); return "Coe is not available right now. Try again later."; };

    // ---- the database (Supabase), reached with the service key, only from here
    const sbUrl = (env.SUPABASE_URL || "").replace(/\/+$/, "");
    const billing = !!(sbUrl && env.SUPABASE_SERVICE_KEY);
    // Old-style keys (long, with dots) go in both headers. New "sb_secret_" keys are not tokens, so they go in apikey only.
    const sbKey = (env.SUPABASE_SERVICE_KEY || "").trim();
    const sb = (p, init = {}) => fetch(sbUrl + p, { ...init, headers: { apikey: sbKey, ...(sbKey.startsWith("sb_") ? {} : { authorization: "Bearer " + sbKey }), "content-type": "application/json", ...(init.headers || {}) } });
    // Tokens a day. Free covers a normal study session (about 20 chats); Pro covers a heavy day (about 300). Signing in doubles what a visitor gets.
    const limits = { free: num(env.FREE_DAILY_TOKENS, 120000), pro: num(env.PRO_DAILY_TOKENS, 2000000), anon: num(env.ANON_DAILY_TOKENS, 50000) };
    const receiptSecret = sbKey + "|" + String(env.API_KEY || "");
    const callKey = async (sub, id) => (await hmac(receiptSecret, "call|" + sub + "|" + id)).slice(0, 20);
    const callId = /^[a-z0-9]{8,32}$/.test(request.headers.get("x-coe-call") || "") ? request.headers.get("x-coe-call") : "";
    const quotas = { ...QUOTA, app: { free: num(env.APPS_FREE, QUOTA.app.free), pro: QUOTA.app.pro } };
    const stripeBase = env.STRIPE_URL || "https://api.stripe.com";
    const stripe = (p, form, method = "POST") => fetch(stripeBase + p, {
      method,
      headers: { authorization: "Bearer " + env.STRIPE_SECRET_KEY, "content-type": "application/x-www-form-urlencoded" },
      body: method === "GET" ? undefined : new URLSearchParams(form).toString(),
    });
    const subOf = async (uid) => {
      const r = await sb("/rest/v1/subs?select=plan,status,customer,sub,period_end&user_id=eq." + encodeURIComponent(uid));
      return r.ok ? (await r.json())[0] || null : null;
    };
    const isPro = (s) => !!s && (s.status === "active" || s.status === "trialing");
    const proEmails = (env.PRO_EMAILS || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
    // Pro comes from a paid plan. The only other way is an email you list yourself.
    const planFor = async (who) => {
      if (!who) return { plan: "free" };
      if (proEmails.includes((who.email || "").toLowerCase())) return { plan: "pro", given: true };
      const sub = await subOf(who.id);
      return isPro(sub) ? { plan: "pro", sub } : { plan: "free", sub };
    };
    const spend = async (subject, cost, limit) => {
      const r = await sb("/rest/v1/rpc/spend", { method: "POST", body: JSON.stringify({ p_subject: subject, p_cost: cost, p_limit: limit }) });
      if (!r.ok) throw new Error("spend failed");
      return Number(await r.json());
    };
    const usedToday = async (subject) => {
      const day = new Date().toISOString().slice(0, 10);
      const r = await sb("/rest/v1/usage?select=used&subject=eq." + encodeURIComponent(subject) + "&day=eq." + day);
      return r.ok ? Number((await r.json())[0]?.used || 0) : 0;
    };
    const saveSub = async (row) => {
      const r = await sb("/rest/v1/subs?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
      if (!r.ok) throw new Error("could not save the plan");
    };
    const periodEnd = (s) => {
      const t = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
      return t ? new Date(t * 1000).toISOString() : null;
    };

    // ---- Stripe tells us here when someone pays, changes or cancels. It is checked by signature, not by origin.
    if (path === "/stripe") {
      if (request.method !== "POST" || !billing || !env.STRIPE_WEBHOOK_SECRET) return reply(404, { error: { message: "Not found." } });
      const raw = await request.text();
      const head = Object.fromEntries((request.headers.get("stripe-signature") || "").split(",").map((p) => p.split("=")));
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(head.t + "." + raw));
      const want = [...new Uint8Array(mac)].map((x) => x.toString(16).padStart(2, "0")).join("");
      if (!head.t || want !== head.v1 || Math.abs(Date.now() / 1000 - Number(head.t)) > 300) return reply(400, { error: { message: "Bad signature." } });
      try {
        const ev = JSON.parse(raw), o = ev.data.object;
        if (ev.type === "checkout.session.completed" && o.mode === "subscription" && o.client_reference_id) {
          const sr = await stripe("/v1/subscriptions/" + o.subscription, null, "GET"); const s = await sr.json();
          await saveSub({ user_id: o.client_reference_id, plan: "pro", status: s.status, customer: o.customer, sub: s.id, period_end: periodEnd(s) });
        } else if (ev.type.startsWith("customer.subscription.")) {
          let uid = o.metadata?.uid;
          if (!uid) { const r = await sb("/rest/v1/subs?select=user_id&customer=eq." + encodeURIComponent(o.customer)); uid = r.ok ? (await r.json())[0]?.user_id : null; }
          if (uid) await saveSub({ user_id: uid, plan: "pro", status: ev.type.endsWith(".deleted") ? "canceled" : o.status, customer: o.customer, sub: o.id, period_end: periodEnd(o) });
        }
      } catch (e) { return reply(500, { error: { message: "Could not record that." } }); }
      return reply(200, { received: true });
    }

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method === "GET" && path === "/") return new Response("Coe server is running.", { headers: cors });
    // ---- map pictures for Coe Mini. OpenStreetMap's servers turn away requests that do not say who is asking, so the worker asks for the tile with Coe's name and website, keeps it for a week, and hands it on. Only Coe (the website, Coe Mini and test pages) can use it.
    if (request.method === "GET" && path.startsWith("/tile/")) {
      const m = /^\/tile\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})(?:\.png)?$/.exec(path);
      if (!m) return fail(400, "That is not a map tile.");
      const z = Number(m[1]), tx = Number(m[2]), ty = Number(m[3]);
      if (z > 19 || tx >= 2 ** z || ty >= 2 ** z) return fail(400, "That is not a map tile.");
      const ref = String(request.headers.get("referer") || ""), fromCoe = /^(chrome-extension|moz-extension|safari-web-extension):\/\//.test(ref) || allowed.some((o) => o && ref.startsWith(o)) || ref.startsWith("https://coe.pmcstudios.uk/");
      if (!fromCoe) return fail(403, "Map tiles are for Coe only.");
      let r; try { r = await fetch("https://tile.openstreetmap.org/" + z + "/" + tx + "/" + ty + ".png", { headers: { "User-Agent": COE_UA, Referer: "https://coe.pmcstudios.uk/", Accept: "image/png" }, cf: { cacheTtl: 604800, cacheEverything: true } }); } catch { return fail(502, "The map could not be fetched."); }
      if (!r.ok) return fail(502, "The map could not be fetched.");
      return new Response(r.body, { status: 200, headers: { "content-type": "image/png", "cache-control": "public, max-age=604800", ...cors, "Cross-Origin-Resource-Policy": "cross-origin" } });
    }
    if (!okOrigin) { note("A request came from a site that is not in ALLOWED_ORIGINS: " + (request.headers.get("origin") || "no origin")); return fail(403, "Coe is not available from here."); }
    if (env.ACCESS_CODE && request.headers.get("x-coe-code") !== env.ACCESS_CODE) return fail(401, "That access code is not right.");

    // ---- who is asking: nobody, or a signed-in person
    let who = null;
    const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (bearer && sbUrl) {
      const r = await fetch(sbUrl + "/auth/v1/user", { headers: { apikey: env.SUPABASE_ANON_KEY || "", authorization: "Bearer " + bearer } });
      if (!r.ok) return fail(401, "Sign in again to use Coe.", "signin");
      const u = await r.json(); who = { id: u.id, email: u.email };
    }

    // ---- banned accounts: BANNED holds emails or account ids (separated by commas, spaces or new lines). A banned account can sign in and see its status, but cannot ask for or make anything.
    const banned = !!who && String(env.BANNED || "").toLowerCase().split(/[\s,;]+/).filter(Boolean).some((x) => x === String(who.email || "").toLowerCase() || x === String(who.id || "").toLowerCase());
    const BAN_TEXT = "You cannot ask or generate any more responses. To appeal, contact contact@pmcstudios.uk for an answer.";
    if (banned) {
      if (request.method === "GET" && path === "/me") return reply(200, { billing: !!billing, signedIn: true, email: who.email, plan: "free", used: 0, limit: 0, banned: true });
      return fail(403, BAN_TEXT, "banned");
    }

    // ---- the owner: OWNER_EMAILS holds the emails (commas, spaces or new lines) that may use the owner tools. It is checked here, from the signed-in account, never from anything the page says.
    const owners = String(env.OWNER_EMAILS || "").toLowerCase().split(/[\s,;]+/).filter(Boolean);
    const isOwner = !!who && owners.includes(String(who.email || "").toLowerCase());
    const ownerBit = isOwner ? { owner: true } : {};

    // ---- who counts: the account, or the network for people who are not signed in
    let subjectMemo = null, planMemo = null;
    const subjectOf = async () => (subjectMemo ??= who ? who.id : "ip:" + (await sha((request.headers.get("cf-connecting-ip") || "unknown") + (env.API_KEY || ""))));
    const planOf = async () => (planMemo ??= billing ? await planFor(who) : { plan: "free" });
    // A small daily allowance for something only Pro has plenty of. Returns false when today's is used up.
    const quota = async (name, plan) => (await spend(name + ":" + (await subjectOf()), 1, quotas[name][plan])) >= 0;
    const giveBack = async (name) => { await spend(name + ":" + (await subjectOf()), -1, 1e9).catch(() => {}); };

    // Extra tokens earned today (by answering "How am I doing?"). They are added to the day's limit.
    const bonusToday = async () => (billing ? await usedToday("bonus:" + (await subjectOf())) : 0);
    const fbBonus = Math.max(0, Math.min(100000, Math.round(Number(env.FEEDBACK_BONUS)) || FEEDBACK_BONUS));

    // ---- "How am I doing?" and the feedback form. A rating is counted (and quietly earns a few extra tokens, once a day).
    // A written message is emailed to contact@pmcstudios.uk through Resend, when RESEND_API_KEY is set.
    if (request.method === "POST" && path === "/feedback") {
      let b = {}; try { b = await request.json(); } catch { /* an empty body is refused below */ }
      const message = String(b.message || "").trim().slice(0, 2000), kind = ["idea", "problem", "other", "rating"].includes(b.kind) ? b.kind : "rating";
      if (!["bad", "fine", "good"].includes(b.rating) && !message) return fail(400, "Write a message or pick a face.");
      const rated = ["bad", "fine", "good"].includes(b.rating);
      if (billing && rated) await spend("fbtally:" + b.rating, 1, 1e9).catch(() => {});
      let emailed = false;
      if (message && env.RESEND_API_KEY) {
        const ok = billing ? (await spend("fbmsg:" + (await subjectOf()), 1, 8).catch(() => 0)) >= 0 : true;   // 8 messages a day each
        if (ok) {
          const KIND = { idea: ["Idea", "#F2E4CE", "#171717"], problem: ["Problem", "#B3392B", "#F2E4CE"], other: ["Other", "#F2E4CE", "#171717"], rating: ["Rating", "#F2E4CE", "#171717"] }, face = FACE[b.rating];
          const app = fromExt ? "mini" : "web", appName = fromExt ? "Coe Mini" : "Coe website", ver = String(b.v || "").replace(/[^0-9A-Za-z.\-]/g, "").slice(0, 24);
          const page = String(b.page || "").slice(0, 200), from = who?.email || "", k = KIND[kind] || KIND.other, head = appName + (ver ? " " + ver : "");
          const subject = head + " \u00b7 " + k[0] + ": " + message.replace(/\s+/g, " ").slice(0, 60) + (message.length > 60 ? "\u2026" : "");
          emailed = await mailTeam(env, { subject, replySubject: "Re: your feedback on Coe", preheader: head + ". " + message.slice(0, 80), title: "New feedback", titleImg: "title-feedback", titleW: 231, urgent: kind === "problem", app, ver, tag: [k[0], k[1]], message, reply: from,
            chips: face ? [[face[0], face[1], face[2]]] : [],
            rows: [["From", from || "Not signed in"], ["Plan", who ? (await planOf().catch(() => ({}))).plan : ""], ["Page", app === "web" && page ? SITE + page : "", true], ["Sent", new Date().toUTCString().replace(" GMT", " UTC")]],
            plain: head + " | " + k[0] + (face ? " | " + face[0] : "") + "\n\n" + message + "\n\n---\nFrom: " + (from || "not signed in") + "\nPage: " + page });
        }
      }
      // The bonus: once a day, for a rating or for a message that really was sent.
      let bonus = 0;
      if (billing && (rated || emailed)) {
        const sub = await subjectOf();
        if ((await spend("fb:" + sub, 1, 1).catch(() => -1)) >= 0) { bonus = fbBonus; await spend("bonus:" + sub, bonus, 1e9).catch(() => { bonus = 0; }); }
      }
      return reply(200, { ok: true, emailed, bonus });
    }

    if (request.method === "GET" && path === "/me") {
      if (!billing) return reply(200, { billing: false, signedIn: !!who, plan: "free", used: 0, limit: limits.free, ...ownerBit });
      const pl = await planOf(), plan = pl.plan, sub = await subjectOf();
      const q = {};
      for (const k of Object.keys(quotas)) q[k] = { used: await usedToday(k + ":" + sub), limit: quotas[k][plan] };
      let week = [];
      if (who) {
        const since = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
        const r = await sb("/rest/v1/usage?select=day,used&subject=eq." + encodeURIComponent(who.id) + "&day=gte." + since + "&order=day.asc");
        if (r.ok) week = await r.json();
      }
      let refunds = [];
      if (who) {
        const since2 = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
        const r2 = await sb("/rest/v1/usage?select=day,used&subject=eq." + encodeURIComponent("refunded:" + who.id) + "&day=gte." + since2 + "&order=day.asc");
        if (r2.ok) refunds = await r2.json();
      }
      return reply(200, { ...ownerBit, billing: true, canBuy: !!env.STRIPE_SECRET_KEY, signedIn: !!who, email: who?.email, plan, given: !!pl.given, used: who ? await usedToday(who.id) : 0, limit: (who ? limits[plan] : limits.anon) + (await bonusToday()), renews: pl.sub && plan === "pro" ? pl.sub.period_end : undefined, quotas: q, week, refunds, bonus: await bonusToday(), fbBonus, fbDone: (await usedToday("fb:" + sub)) > 0 });
    }

    // ---- Report a chat: a shared one (it comes with its link) or one open in Coe or Coe Mini (it can come with its last few messages, only when the person left that ticked). 5 a day each. It is emailed to contact@pmcstudios.uk when RESEND_API_KEY is set.
    if (request.method === "POST" && path === "/report") {
      let b = {}; try { b = await request.json(); } catch { /* refused below */ }
      const link = String(b.link || "").slice(0, 400), why = ["unsafe", "private", "wrong", "other"].includes(b.why) ? b.why : "other", note = String(b.note || "").trim().slice(0, 1000);
      const c = b.chat && typeof b.chat === "object" ? b.chat : null, title = String(c?.title || "").replace(/\s+/g, " ").trim().slice(0, 120);
      if (!c && !/^https?:\/\//.test(link)) return fail(400, "That link could not be read.");
      const lines = []; let room = 4000;
      for (const m of Array.isArray(c?.msgs) ? c.msgs.slice(-8) : []) { const t = String(m?.t || "").trim().slice(0, Math.min(700, room)); if (!t) continue; room -= t.length; lines.push([m.r === "you" ? "You" : "Coe", t]); if (room <= 0) break; }
      if (billing && (await spend("report:" + (await subjectOf()), 1, 5).catch(() => 0)) < 0) return fail(429, "You have sent enough reports for today. Thank you.");
      let emailed = false;
      if (env.RESEND_API_KEY) {
        const WHYT = { unsafe: "Unsafe or harmful", private: "Shows private details", wrong: "Wrong or misleading", other: "Something else" }, SHORT = { unsafe: "Unsafe", private: "Private", wrong: "Wrong", other: "Other" }, from = who?.email || "";
        const app = fromExt ? "mini" : "web", appName = fromExt ? "Coe Mini" : "Coe website", ver = String(b.v || "").replace(/[^0-9A-Za-z.\-]/g, "").slice(0, 24), head = appName + (ver ? " " + ver : "");
        const red = why === "other" ? ["#F2E4CE", "#171717"] : ["#B3392B", "#F2E4CE"];
        emailed = await mailTeam(env, { subject: head + " \u00b7 Report: " + SHORT[why] + (title ? " \u2014 " + title.slice(0, 50) : ""), replySubject: "Re: your report on Coe", preheader: head + ". " + (c ? "A chat was reported: " : "A shared chat was reported: ") + WHYT[why], title: "Chat reported", titleImg: "title-report", titleW: 239, urgent: true, app, ver,
          tag: [SHORT[why], red[0]], message: note, lines, reply: from, action: link ? ["Open the shared chat", link] : null,
          rows: [["Chat", c ? (title || "Untitled") + (lines.length ? "" : " (messages not sent)") : "A shared chat"], ["Reported by", from || "Not signed in"], ["Sent", new Date().toUTCString().replace(" GMT", " UTC")]],
          plain: head + " | Report: " + WHYT[why] + "\n" + (link ? "Link: " + link + "\n" : "Chat: " + (title || "Untitled") + "\n") + "Note: " + (note || "none") + (lines.length ? "\n\n" + lines.map((l) => l[0] + ": " + l[1]).join("\n\n") : "") + "\n\n---\nFrom: " + (from || "not signed in") });
      }
      return reply(200, { ok: true, emailed });
    }

    // ---- Owner tools. Only for an email in OWNER_EMAILS. To anyone else this does not exist.
    if (path === "/owner") {
      if (!isOwner) return fail(404, "Not found.");
      if (request.method !== "POST") return fail(405, "Use POST.");
      let b = {}; try { b = await request.json(); } catch { /* an empty body means no command */ }
      const cmd = String(b.cmd || "");
      const yes = (v) => !!String(v || "").trim();
      if (cmd === "refill") {
        if (!billing) return fail(503, "Accounts are not switched on, so there is no count to refill.");
        let reset = 0;
        const used = await usedToday(who.id);
        if (used > 0) { await spend(who.id, -used, 1e9); reset++; }
        for (const k of ["work", "search", "image", "app", "voice", "redo", "check", "fb", "fbmsg", "bonus", "refunded", "report"]) {
          const key = (k === "refunded" ? "refunded:" + who.id : k + ":" + who.id), u = await usedToday(key);
          if (u > 0) { await spend(key, -u, 1e9).catch(() => {}); reset++; }
        }
        return reply(200, { ok: true, reset });
      }
      if (cmd === "status" || cmd === "debug") {
        const pl = billing ? await planFor(who) : { plan: "free" };
        const out = {
          time: new Date().toISOString(), accounts: billing, aiKey: yes(env.API_KEY), stripe: yes(env.STRIPE_SECRET_KEY), stripeWebhook: yes(env.STRIPE_WEBHOOK_SECRET), email: yes(env.RESEND_API_KEY), places: yes(env.GOOGLE_PLACES_KEY),
          models: { swift: env.MODEL_SWIFT || DEFAULTS.swift, core: env.MODEL_CORE || DEFAULTS.core, deep: env.MODEL_DEEP || DEFAULTS.deep },
          allowedOrigins: allowed.length, extensionIds: extIds.length, owners: owners.length, banned: String(env.BANNED || "").split(/[\s,;]+/).filter(Boolean).length, proEmails: proEmails.length,
          accessCode: yes(env.ACCESS_CODE), requireSignIn: yes(env.REQUIRE_SIGNIN), limits, feedbackBonus: fbBonus,
          you: { email: who.email, plan: pl.plan, given: !!pl.given, usedToday: billing ? await usedToday(who.id) : 0 },
        };
        if (cmd === "debug") out.request = { origin: origin || "none", fromExtension: fromExt, country: request.headers.get("cf-ipcountry") || "unknown", ray: request.headers.get("cf-ray") || "none", agent: String(request.headers.get("user-agent") || "").slice(0, 160) };
        return reply(200, { ok: true, status: out });
      }
      return fail(400, "That command is not known.");
    }

    if (request.method === "POST" && path === "/checkout") {
      if (!billing || !env.STRIPE_SECRET_KEY) return fail(503, "Paid plans are not switched on yet.");
      if (!who) return fail(401, "Sign in first, then choose Pro.", "signin");
      let b = {}; try { b = await request.json(); } catch { /* none */ }
      const pl = await planFor(who), sub = pl.sub || (await subOf(who.id));
      if (pl.plan === "pro") return fail(400, "You already have Pro.");
      const price = b.period === "year" ? env.STRIPE_PRICE_PRO_YEAR : env.STRIPE_PRICE_PRO_MONTH;
      if (!price) return fail(503, "That price is not set up yet.");
      const back = allowed.includes(b.back) ? b.back : allowed[0];
      const form = { mode: "subscription", "line_items[0][price]": price, "line_items[0][quantity]": "1", client_reference_id: who.id, "subscription_data[metadata][uid]": who.id, allow_promotion_codes: "true", success_url: back + "/plans/?paid=1", cancel_url: back + "/plans/" };
      if (sub?.customer) form.customer = sub.customer; else if (who.email) form.customer_email = who.email;
      const r = await stripe("/v1/checkout/sessions", form); const s = await r.json();
      if (!r.ok || !s.url) return fail(502, "Could not start the payment. Try again in a moment.");
      return reply(200, { url: s.url });
    }

    if (request.method === "POST" && path === "/portal") {
      if (!billing || !env.STRIPE_SECRET_KEY) return fail(503, "Paid plans are not switched on yet.");
      if (!who) return fail(401, "Sign in first.", "signin");
      let b = {}; try { b = await request.json(); } catch { /* none */ }
      const sub = await subOf(who.id);
      if (!sub?.customer) return fail(400, "There is no paid plan on this account.");
      const back = allowed.includes(b.back) ? b.back : allowed[0];
      const r = await stripe("/v1/billing_portal/sessions", { customer: sub.customer, return_url: back + "/plans/" }); const s = await r.json();
      if (!r.ok || !s.url) return fail(502, "Could not open the billing page. Try again in a moment.");
      return reply(200, { url: s.url });
    }

    // ---- a web search (Pro has plenty, Free gets a taste)
    if (request.method === "POST" && path === "/search") {
      if (billing && env.REQUIRE_SIGNIN && !who) return fail(401, "Sign in to use Coe.", "signin");
      let b = {}; try { b = await request.json(); } catch { /* none */ }
      const q = String(b.q || "").trim().slice(0, 600);
      if (!q) return fail(400, "There is nothing to search for.");
      let plan = "free", subject = "", paid = false;
      if (billing) {
        plan = (await planOf()).plan; subject = await subjectOf();
        try {
          if (!(await quota("search", plan))) return fail(403, plan === "pro" ? "You have used today's web searches. They come back at midnight (UTC)." : `Free includes ${quotas.search.free} web searches a day. Pro has ${quotas.search.pro}.`, "plan");
          if ((await spend(subject, COST_SEARCH, who ? limits[plan] : limits.anon)) < 0) { await giveBack("search"); return fail(402, "Not enough tokens left today for a web search.", "credits"); }
          paid = true;
        } catch (e) { return fail(503, "Credits could not be checked just now. Try again in a moment."); }
      }
      const undo = async () => { if (paid) { await spend(subject, -COST_SEARCH, 1e9).catch(() => {}); await giveBack("search"); } };
      let r;
      try {
        r = await fetch(env.OPENAI_RESPONSES_URL || "https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { "content-type": "application/json", "authorization": "Bearer " + String(env.API_KEY || "").trim().replace(/^["']|["']$/g, "") },
          body: JSON.stringify({ model: env.MODEL_SEARCH || env.MODEL_CORE || DEFAULTS.core, tools: [{ type: "web_search" }], input: "Search the web and report what you find for this request. Give the key facts in short plain notes, with names, numbers and dates, and say where each came from.\n\nRequest: " + q, max_output_tokens: 3000 }),
        });
      } catch (e) { await undo(); return fail(502, "The search could not be reached. Try again in a moment."); }
      if (!r.ok) {
        await undo();
        if (r.status === 401 || r.status === 403) return fail(503, keyMsg());
        return fail(502, "Web search is not available on this key right now.");
      }
      const j = await r.json(); let text = "", sources = [];
      for (const it of j.output || []) if (it.type === "message") for (const c of it.content || []) if (c.type === "output_text") {
        text += c.text || "";
        for (const a of c.annotations || []) if (a.type === "url_citation" && a.url && !sources.some((x) => x.url === a.url)) sources.push({ title: a.title || a.url, url: a.url });
      }
      return reply(200, { text: text.slice(0, 12000), sources: sources.slice(0, 12) });
    }

    // ---- a picture
    if (request.method === "POST" && path === "/image") {
      if (billing && env.REQUIRE_SIGNIN && !who) return fail(401, "Sign in to use Coe.", "signin");
      let b = {}; try { b = await request.json(); } catch { /* none */ }
      const prompt = String(b.prompt || "").trim().slice(0, 4000);
      if (!prompt) return fail(400, "There is nothing to draw.");
      let plan = "free", subject = "", paid = false;
      if (billing) {
        plan = (await planOf()).plan; subject = await subjectOf();
        try {
          if (!(await quota("image", plan))) return fail(403, plan === "pro" ? "You have used today's pictures. They come back at midnight (UTC)." : `Free includes ${quotas.image.free} pictures a day. Pro has ${quotas.image.pro}.`, "plan");
          if ((await spend(subject, COST_IMAGE, who ? limits[plan] : limits.anon)) < 0) { await giveBack("image"); return fail(402, "Not enough tokens left today for a picture.", "credits"); }
          paid = true;
        } catch (e) { return fail(503, "Credits could not be checked just now. Try again in a moment."); }
      }
      const undo = async () => { if (paid) { await spend(subject, -COST_IMAGE, 1e9).catch(() => {}); await giveBack("image"); } };
      let r;
      try {
        r = await fetch(env.OPENAI_IMAGES_URL || "https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { "content-type": "application/json", "authorization": "Bearer " + String(env.API_KEY || "").trim().replace(/^["']|["']$/g, "") },
          body: JSON.stringify({ model: env.MODEL_IMAGE || "gpt-image-2.5-flare", prompt, n: 1 }),
        });
      } catch (e) { await undo(); return fail(502, "The picture maker could not be reached. Try again in a moment."); }
      if (!r.ok) {
        await undo();
        let m = ""; try { m = (await r.json())?.error?.message || ""; } catch { /* none */ }
        if (r.status === 401) return fail(503, keyMsg());
        if (r.status === 403) return fail(503, (note("Pictures were refused. The OpenAI organisation may need verifying in the OpenAI dashboard."), "The picture service is not available right now. Try again later."));
        if (r.status === 400 && /safety|policy|moderation/i.test(m)) return fail(400, "That picture was turned down by the safety rules. Try a different idea.");
        return fail(502, "The picture service had a problem. Try again in a moment.");
      }
      const j = await r.json(); const d = j.data && j.data[0];
      let data = d && d.b64_json;
      if (!data && d && d.url) { try { const f = await fetch(d.url, { headers: { "User-Agent": COE_UA } }); const buf = new Uint8Array(await f.arrayBuffer()); let bin = ""; for (let k = 0; k < buf.length; k += 8192) bin += String.fromCharCode(...buf.subarray(k, k + 8192)); data = btoa(bin); } catch (e) { /* below */ } }
      if (!data) { await undo(); return fail(502, "The picture service had a problem. Try again in a moment."); }
      const type = data.startsWith("/9j/") ? "image/jpeg" : data.startsWith("UklGR") ? "image/webp" : data.startsWith("R0lGOD") ? "image/gif" : data.startsWith("PHN2Zy") || data.startsWith("PD94bWw") ? "image/svg+xml" : "image/png";
      return reply(200, { data, type });
    }

    // ---- voice: speech to text. The body is the audio itself.
    if (request.method === "POST" && path === "/transcribe") {
      if (billing && env.REQUIRE_SIGNIN && !who) return fail(401, "Sign in to use Coe.", "signin");
      const type = (request.headers.get("content-type") || "audio/webm").split(";")[0].trim().toLowerCase();
      const ext = { "audio/webm": "webm", "video/webm": "webm", "audio/mp4": "mp4", "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/ogg": "webm" }[type];
      if (!ext) return fail(415, "That kind of audio cannot be read. Use mp3, mp4, m4a, wav or webm.");
      let plan = "free"; if (billing) plan = (await planOf()).plan;
      if (Number(request.headers.get("content-length") || 0) > (plan === "pro" ? 24000000 : 6000000)) return fail(413, plan === "pro" ? "That audio is over 24 MB. Try a shorter piece." : "That audio is too long for Free (about 6 MB). Pro takes up to 24 MB.", plan === "pro" ? undefined : "plan");
      const buf = await request.arrayBuffer();
      if (!buf.byteLength) return fail(400, "There was no audio.");
      let paid = false;
      if (billing) {
        try { if (!(await quota("voice", plan))) return fail(403, plan === "pro" ? "You have used today's voice. It comes back at midnight (UTC)." : `Free includes ${quotas.voice.free} voice turns a day. Pro has ${quotas.voice.pro}.`, "plan"); paid = true; }
        catch (e) { return fail(503, "Voice could not be checked just now. Try again in a moment."); }
      }
      const key = String(env.API_KEY || "").trim().replace(/^["']|["']$/g, "");
      const lang = (request.headers.get("x-coe-lang") || "").slice(0, 8).replace(/[^a-zA-Z-]/g, "");
      let r = null;
      for (const model of [env.MODEL_TRANSCRIBE || "gpt-transcribe", "gpt-4o-mini-transcribe"]) {
        const fd = new FormData(); fd.append("file", new Blob([buf], { type }), "audio." + ext); fd.append("model", model); if (lang) fd.append("language", lang.slice(0, 2));
        try { r = await fetch(env.OPENAI_TRANSCRIBE_URL || "https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: "Bearer " + key }, body: fd }); }
        catch (e) { r = null; break; }
        if (r.ok || (r.status !== 404 && r.status !== 400)) break;
      }
      if (!r || !r.ok) {
        if (paid) await giveBack("voice");
        if (r && r.status === 401) return fail(503, keyMsg());
        return fail(502, "The voice could not be read. Try again in a moment.");
      }
      let j = {}; try { j = await r.json(); } catch { /* none */ }
      return reply(200, { text: String(j.text || "").trim() });
    }

    // ---- listening to a sound: which instruments, voices and noises are in it. The body is a short WAV (the browser cuts it to 30 seconds).
    if (request.method === "POST" && path === "/hear") {
      if (billing && env.REQUIRE_SIGNIN && !who) return fail(401, "Sign in to use Coe.", "signin");
      let plan = "free", paid = false; if (billing) plan = (await planOf()).plan;
      if (Number(request.headers.get("content-length") || 0) > 3200000) return fail(413, "That sound is too long to listen to in one go. Coe listens to 30 seconds at a time.");
      const buf = new Uint8Array(await request.arrayBuffer());
      if (!buf.byteLength) return fail(400, "There was no sound.");
      if (billing) {
        try { if (!(await quota("hear", plan))) return fail(403, plan === "pro" ? "You have used today's sound listening. It comes back at midnight (UTC)." : `Free includes ${quotas.hear.free} sound listens a day. Pro has ${quotas.hear.pro}.`, "plan"); paid = true; }
        catch (e) { return fail(503, "Listening could not be checked just now. Try again in a moment."); }
      }
      let bin = ""; for (let k = 0; k < buf.length; k += 8192) bin += String.fromCharCode.apply(null, buf.subarray(k, k + 8192));
      const ask = "Listen carefully to this sound. Reply with JSON only, no other words: {\"summary\": one plain sentence about what it is, \"instruments\": [{\"name\": string, \"confidence\": \"high\"|\"medium\"|\"low\", \"role\": string}], \"voices\": [string], \"noises\": [string], \"setting\": string, \"notes\": string}. Name instruments and everyday noises only when you can actually hear them. Say \"low\" confidence when unsure, and use empty lists when there is none. Never invent things.";
      let r;
      try {
        r = await fetch(env.OPENAI_URL || "https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + String(env.API_KEY || "").trim().replace(/^["']|["']$/g, "") },
          body: JSON.stringify({ model: env.MODEL_AUDIO || "gpt-audio-mini", modalities: ["text"], messages: [{ role: "user", content: [{ type: "text", text: ask }, { type: "input_audio", input_audio: { data: btoa(bin), format: "wav" } }] }] }) });
      } catch (e) { if (paid) await giveBack("hear"); return fail(502, "Listening could not be reached. Try again in a moment."); }
      if (!r.ok) { if (paid) await giveBack("hear"); return fail(r.status === 401 ? 503 : 502, r.status === 401 ? keyMsg() : "Coe could not listen to that just now. Try again in a moment."); }
      let j = {}; try { j = await r.json(); } catch { /* none */ }
      let said = String(j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || "").trim();
      said = said.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      let out = null; try { out = JSON.parse(said); } catch { /* not JSON */ }
      return reply(200, out && typeof out === "object" ? { heard: out } : { heard: { summary: said.slice(0, 600) } });
    }

    // ---- a run of a PMC App inside the chat. Free has a few a day. Pro never runs out.
    // ---- businesses and places with ratings, phone, website and photos. Optional: it needs GOOGLE_PLACES_KEY. Without it Coe still finds places through OpenStreetMap.
    if (request.method === "GET" && path === "/places/photo") {
      if (!env.GOOGLE_PLACES_KEY) return fail(404, "Not switched on.");
      const ref = String(url.searchParams.get("ref") || "");
      if (!/^places\/[\w-]{5,200}\/photos\/[\w-]{5,400}$/.test(ref)) return fail(400, "That is not a photo.");
      const w = Math.max(100, Math.min(800, Number(url.searchParams.get("w")) || 400));
      let r; try { r = await fetch((env.PLACES_URL || "https://places.googleapis.com/v1/") + ref + "/media?maxWidthPx=" + w + "&key=" + encodeURIComponent(String(env.GOOGLE_PLACES_KEY).trim()), { headers: { "User-Agent": COE_UA } }); } catch { return fail(502, "The photo could not be fetched."); }
      if (!r.ok) return fail(502, "The photo could not be fetched.");
      return new Response(r.body, { status: 200, headers: { "content-type": r.headers.get("content-type") || "image/jpeg", "cache-control": "public, max-age=86400", ...cors, "Cross-Origin-Resource-Policy": "cross-origin" } });
    }
    if (request.method === "POST" && path === "/places") {
      if (!env.GOOGLE_PLACES_KEY) return fail(501, "Business details are not switched on.", "off");
      if (billing && env.REQUIRE_SIGNIN && !who) return fail(401, "Sign in to use Coe.", "signin");
      let b = {}; try { b = await request.json(); } catch { /* refused below */ }
      const q = String(b.query || "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (!q) return fail(400, "Say which place or business to look up.");
      if (billing) {
        const plan = (await planOf()).plan;
        try { if (!(await quota("places", plan))) return fail(403, plan === "pro" ? "You have used today's business look-ups. They come back at midnight (UTC)." : `Free includes ${quotas.places.free} business look-ups a day, and today's are used.`, "credits"); }
        catch (e) { return fail(503, "That could not be checked just now. Try again in a moment."); }
      }
      const body = { textQuery: q, maxResultCount: Math.max(1, Math.min(8, Number(b.limit) || 5)), languageCode: "en-GB" };
      if (Array.isArray(b.near) && b.near.length === 2 && b.near.every((n) => Number.isFinite(Number(n)))) body.locationBias = { circle: { center: { latitude: Number(b.near[0]), longitude: Number(b.near[1]) }, radius: Math.max(500, Math.min(50000, (Number(b.radius_km) || 15) * 1000)) } };
      let r; try {
        r = await fetch((env.PLACES_URL || "https://places.googleapis.com/v1/") + "places:searchText", { method: "POST", headers: { "User-Agent": COE_UA, "content-type": "application/json", "X-Goog-Api-Key": String(env.GOOGLE_PLACES_KEY).trim(), "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.priceLevel,places.regularOpeningHours.weekdayDescriptions,places.regularOpeningHours.openNow,places.photos,places.primaryTypeDisplayName,places.googleMapsUri,places.editorialSummary,places.businessStatus" }, body: JSON.stringify(body) });
      } catch (e) { return fail(502, "The business look-up could not be reached."); }
      if (!r.ok) return fail(r.status === 403 || r.status === 400 ? 503 : 502, r.status === 403 || r.status === 400 ? (note("Business look-up was refused. Check GOOGLE_PLACES_KEY and that Places API (New) is switched on."), "The business look-up is not available right now. Try again later.") : "The business look-up failed. Try again in a moment.");
      let j = {}; try { j = await r.json(); } catch { /* none */ }
      const price = { PRICE_LEVEL_FREE: "Free", PRICE_LEVEL_INEXPENSIVE: "£", PRICE_LEVEL_MODERATE: "££", PRICE_LEVEL_EXPENSIVE: "£££", PRICE_LEVEL_VERY_EXPENSIVE: "££££" };
      const places = (j.places || []).map((p) => ({
        name: p.displayName?.text || "", kind: p.primaryTypeDisplayName?.text || "", address: p.formattedAddress || "", lat: p.location?.latitude, lng: p.location?.longitude,
        rating: typeof p.rating === "number" ? p.rating : undefined, reviews: typeof p.userRatingCount === "number" ? p.userRatingCount : undefined,
        phone: p.nationalPhoneNumber || undefined, website: p.websiteUri || undefined, price: price[p.priceLevel] || undefined,
        hours: p.regularOpeningHours?.weekdayDescriptions || undefined, open: typeof p.regularOpeningHours?.openNow === "boolean" ? p.regularOpeningHours.openNow : undefined,
        summary: p.editorialSummary?.text || undefined, mapsUrl: p.googleMapsUri || undefined, closed: p.businessStatus && p.businessStatus !== "OPERATIONAL" ? p.businessStatus : undefined,
        photo: p.photos?.[0]?.name ? "/places/photo?ref=" + encodeURIComponent(p.photos[0].name) : undefined,
      })).filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lng));
      return reply(200, { places });
    }

    if (request.method === "POST" && path === "/app-use") {
      if (!billing) return reply(200, { ok: true });
      const plan = (await planOf()).plan, sub = await subjectOf(), key = "app:" + sub;
      try {
        if ((await spend(key, 1, quotas.app[plan])) < 0) return fail(403, `Free includes ${quotas.app.free} PMC App runs a day in Coe. Pro never runs out. (The apps on apps.pmcstudios.uk stay free to use there.)`, "plan");
        return reply(200, { ok: true, used: await usedToday(key), limit: quotas.app[plan] });
      } catch (e) { return fail(503, "That could not be checked just now. Try again in a moment."); }
    }

    // ---- delete the account and what is saved with it
    // ---- a reply went wrong: the tokens it used come back. Each receipt works once, and only for the person it was made for.
    if (request.method === "POST" && path === "/refund") {
      if (!billing) return fail(404, "Not found.");
      let b = {}; try { b = await request.json(); } catch { /* none */ }
      const subject = await subjectOf(), today = new Date().toISOString().slice(0, 10);
      const list = Array.isArray(b.receipts) ? [...new Set(b.receipts.map(String))].slice(0, 24) : [];
      const ids = Array.isArray(b.calls) ? [...new Set(b.calls.map(String).filter((x) => /^[a-z0-9]{8,32}$/.test(x)))].slice(0, 24) : [];
      const good = [], seen = new Set();
      for (const rc of list) {
        const [t, nonce, day, sig] = rc.split(".");
        const tokens = Number(t);
        if (!(tokens > 0) || tokens > 5e6 || !nonce || day !== today || !sig || seen.has(nonce)) continue;
        if (sig !== (await hmac(receiptSecret, [subject, tokens, nonce, day].join("|")))) continue;
        seen.add(nonce); good.push({ tokens, nonce });
      }
      // Calls the page never got a receipt for (it stopped the model early). The cost was written down on this side, so it is read back from there.
      for (let tries = 0; tries < 3; tries++) {
        let missing = 0;
        for (const id of ids) {
          const nonce = await callKey(subject, id);
          if (seen.has(nonce)) continue;
          const tokens = await usedToday("call:" + nonce);
          if (tokens > 0) { seen.add(nonce); good.push({ tokens, nonce }); } else missing++;
        }
        if (!missing || tries === 2) break;
        await new Promise((ok) => setTimeout(ok, 700));      // the charge for a call that was stopped is written a moment after it
      }
      const pl = await planOf(), plan = pl.plan;
      const cap = Math.round(((who ? limits[plan] : limits.anon) + (await bonusToday())) * REFUND_SHARE);
      let paid = 0, taken = 0;
      try {
        const room = Math.max(0, cap - (await usedToday("refunded:" + subject)));
        for (const g of good) {
          if ((await spend("rc:" + g.nonce, 1, 1)) < 0) continue;          // already paid back
          taken += g.tokens;
        }
        paid = Math.min(taken, room);
        if (paid > 0) { await spend("refunded:" + subject, paid, 1e12); await spend(subject, -paid, 1e12); }
      } catch (e) { return fail(503, "Your tokens could not be given back just now. Try again in a moment."); }
      return reply(200, { refunded: paid, capped: taken > paid, used: await usedToday(subject), limit: (who ? limits[plan] : limits.anon) + (await bonusToday()), plan });
    }

    if (request.method === "POST" && path === "/account/delete") {
      if (!billing) return fail(503, "Accounts are not switched on.");
      if (!who) return fail(401, "Sign in first.", "signin");
      const pl = await planOf();
      if (pl.plan === "pro" && !pl.given) return fail(400, "Cancel your Pro plan first (Plans > Manage plan), then delete the account.");
      const enc = encodeURIComponent(who.id);
      for (const p of ["/rest/v1/chats?user_id=eq." + enc, "/rest/v1/profiles?user_id=eq." + enc, "/rest/v1/usage?subject=like." + encodeURIComponent("*" + who.id), "/rest/v1/usage?subject=eq." + enc]) { await sb(p, { method: "DELETE" }).catch(() => {}); }
      const r = await sb("/auth/v1/admin/users/" + enc, { method: "DELETE" });
      if (!r.ok) return fail(502, "The account could not be deleted just now. Try again in a moment.");
      return reply(200, { deleted: true });
    }

    if (request.method !== "POST" || path !== "/") return fail(404, "Not found.");
    if (env.REQUIRE_SIGNIN && !who) return fail(401, "Sign in to use Coe.", "signin");
    // The owner can ask for a pretend problem (x-coe-test), to see how each one looks. Anyone else's header is ignored.
    const test = isOwner ? String(request.headers.get("x-coe-test") || "") : "";
    if (test) {
      const T = { limit: [402, "Your tokens for today are used up. They come back at midnight (UTC). This is a test."], plan: [403, "Coe Deep is part of Pro. This is a test.", "plan"], busy: [429, "Coe is busy right now. Try again in a moment. This is a test."],
        down: [502, "The model could not be reached. Try again in a moment. This is a test."], key: [503, "Coe is not available right now. Try again later. This is a test."], signin: [401, "Sign in again to use Coe. This is a test.", "signin"],
        banned: [403, BAN_TEXT, "banned"], check: [429, "The free double-checks for today are used. This is a test.", "check_cap"], big: [413, "That is too big for Free. This is a test."] };
      if (test === "slow") await new Promise((r) => setTimeout(r, 8000));
      else if (T[test]) return fail(T[test][0], T[test][1], T[test][2]);
    }
    const planEarly = billing ? (await planOf()).plan : "free";
    if (Number(request.headers.get("content-length") || 0) > BIGGEST[planEarly]) return fail(413, planEarly === "pro" ? "That is too much to send at once." : "That is too big for Free. Pro can send much bigger files.", planEarly === "pro" ? undefined : "plan");
    let body;
    try { body = await request.json(); } catch { return fail(400, "That request could not be read."); }
    if (!TIERS[body.model]) return fail(400, "That model is not allowed here.");
    if (!Array.isArray(body.messages) || !body.messages.length) return fail(400, "There is nothing to answer.");
    const work = body.work === true, step = request.headers.get("x-coe-step") === "1";

    // ---- tokens
    let plan = "free", subject = "", limit = 0, used = 0, tasted = false, freebie = false;
    if (billing) {
      plan = planEarly;
      if (body.model === "deep" && plan !== "pro" && !work) return fail(403, "Coe Deep is part of Pro.", "plan");
      subject = await subjectOf();
      limit = (who ? limits[plan] : limits.anon) + (await bonusToday());
      try {
        // Deep Work is Pro. Free gets one taste a day, and its follow-up steps ride along with that.
        if (work && plan !== "pro" && !step) {
          if (!(await quota("work", plan))) return fail(403, "Deep Work is part of Pro. Free gets " + quotas.work.free + " a day, and it is used.", "plan");
          tasted = true;
        }
        // A "wrong? redo", and Coe looking over its own answer, are not counted (up to a daily allowance), so being careful is never a reason to skip it.
        if (request.headers.get("x-coe-redo") === "1" && (await spend("redo:" + subject, 1, num(env[plan === "pro" ? "REDO_PRO" : "REDO_FREE"], REDO[plan]))) >= 0) freebie = true;
        if (request.headers.get("x-coe-check") === "1") {
          if ((await spend("check:" + subject, 1, num(env[plan === "pro" ? "CHECK_PRO" : "CHECK_FREE"], CHECK[plan]))) < 0) return fail(429, "The free double-checks for today are used.", "check_cap");
          freebie = true;
        }
        used = await usedToday(subject);
        if (used >= limit) { if (tasted) await giveBack("work"); return fail(402, who ? `Your ${num2(limit)} tokens for today are used up. They come back at midnight (UTC).${plan === "free" ? ` Pro has ${num2(limits.pro)} a day.` : ""}` : "Too much use from this network today. Sign in, or try again tomorrow.", "credits"); }
      } catch (e) { return fail(503, "Your tokens could not be checked just now. Try again in a moment."); }
    }

    const asked = Number(body.max_completion_tokens || body.max_tokens) || 1024;
    const cap = billing ? (work ? REPLY.work : REPLY[plan]) : (work ? REPLY.work : MOST);
    const tier = work ? "deep" : body.model;
    const out = {
      model: env[TIERS[tier]] || DEFAULTS[tier],
      messages: body.messages,
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: Math.min(asked, cap) + (work ? EXTRA_WORK : EXTRA),
    };
    if (work) out.reasoning_effort = "high";
    const send = (o) => fetch(env.OPENAI_URL || "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + String(env.API_KEY || "").trim().replace(/^["']|["']$/g, "") },
      body: JSON.stringify(o),
    });
    let upstream;
    try {
      upstream = await send(out);
      // A model that does not take a reasoning setting is asked again without it.
      if (work && upstream.status === 400 && /reasoning/i.test(await upstream.clone().text().catch(() => ""))) { delete out.reasoning_effort; upstream = await send(out); }
    } catch (e) { upstream = null; }
    if (!upstream || !upstream.ok) {
      if (tasted) await giveBack("work");
      if (!upstream) return fail(502, "The model could not be reached. Try again in a moment.");
      if (upstream.status === 401 || upstream.status === 403) return fail(503, keyMsg());
    }
    const credit = billing && who ? { "x-coe-used": String(used), "x-coe-limit": String(limit), "x-coe-plan": plan } : {};
    const headers = { ...cors, ...credit, "content-type": upstream.headers.get("content-type") || "application/json" };
    if (!billing || !upstream.ok || !upstream.body) return new Response(upstream.body, { status: upstream.status, headers });

    // Pass the answer through, and count the tokens it used when it ends. The total is sent on as a last note, so the page can show it at once.
    const { readable, writable } = new TransformStream();
    const guess = Math.ceil(JSON.stringify(body.messages).length / 4);
    ctx.waitUntil((async () => {
      const w = writable.getWriter(), r = upstream.body.getReader(), dec = new TextDecoder(), enc = new TextEncoder();
      let tail = "", bytes = 0, charged = false, ended = false;
      const charge = async (tokens) => {
        charged = true;
        const weighted = freebie ? 0 : Math.max(1, Math.ceil(tokens * (WEIGHT[tier] || 1)));
        let total = used; try { total = weighted ? await spend(subject, weighted, 1e12) : used; } catch { /* the reply still goes through */ }
        let receipt;
        if (weighted) {
          try {
            const day = new Date().toISOString().slice(0, 10);
            // The page names each call. What it cost is kept under a key only this server can make, so even when the page was told to stop listening (it stops the model the moment it asks for a tool) the call can still be paid back.
            const nonce = callId ? await callKey(subject, callId) : hex(crypto.getRandomValues(new Uint8Array(8)));
            if (callId) { try { await spend("call:" + nonce, weighted, 1e12); } catch { /* no record, so no refund by id */ } }
            receipt = [weighted, nonce, day, await hmac(receiptSecret, [subject, weighted, nonce, day].join("|"))].join(".");
          } catch { /* no receipt, so no refund */ }
        }
        return { tokens: weighted, used: total, limit, plan, ...(receipt ? { receipt } : {}) };
      };
      try {
        for (;;) {
          const { done, value } = await r.read(); if (done) { ended = true; break; }
          bytes += value.length;
          const text = dec.decode(value, { stream: true }); tail = (tail + text).slice(-3000);
          if (!charged && tail.includes("[DONE]")) {
            const all = [...tail.matchAll(/"total_tokens"\s*:\s*(\d+)/g)];
            const pin = [...tail.matchAll(/"prompt_tokens"\s*:\s*(\d+)/g)], pout = [...tail.matchAll(/"completion_tokens"\s*:\s*(\d+)/g)];
            const real = all.length ? Number(all[all.length - 1][1]) : pin.length && pout.length ? Number(pin[pin.length - 1][1]) + Number(pout[pout.length - 1][1]) : guess + Math.ceil(bytes / 8);
            await w.write(enc.encode("data: " + JSON.stringify({ coe_usage: await charge(real) }) + "\n\n"));
          }
          await w.write(value);
        }
      } catch { /* the person closed the page or pressed stop */ }
      finally {
        // The page stopped listening (the person pressed stop, or Coe cut the model off after it asked for a tool): what was written is still paid for. A line that dropped on the model's side is not (the loop above only ends that way when the model finished).
        if (!charged && !ended) await charge(guess + Math.ceil(bytes / 8));
        try { await w.close(); } catch { /* already closed */ }
      }
    })());
    return new Response(readable, { status: upstream.status, headers });
  },
};
