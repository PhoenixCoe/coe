// Coe server: a Cloudflare Worker. It keeps your OpenAI key secret, counts credits, and sells Pro through Stripe.
//
// 1. In Cloudflare, create a Worker and paste this file in.
// 2. Settings > Variables and Secrets, add:
//      API_KEY                (secret)  your OpenAI key
//      ALLOWED_ORIGINS        (text)    https://coe.pmcstudios.uk
//      MODEL_SWIFT / MODEL_CORE / MODEL_DEEP  (text, optional)  default gpt-5-mini / gpt-5 / gpt-5
//      ACCESS_CODE            (secret, optional)  people without it are turned away
//    For accounts, credits and Pro (all optional, see DEPLOY.md):
//      SUPABASE_URL, SUPABASE_ANON_KEY   (text)
//      SUPABASE_SERVICE_KEY              (secret)  lets the Worker count credits. Never put this in the site.
//      STRIPE_SECRET_KEY                 (secret)
//      STRIPE_WEBHOOK_SECRET             (secret)
//      STRIPE_PRICE_PRO_MONTH, STRIPE_PRICE_PRO_YEAR  (text)  price ids from Stripe
//      FREE_DAILY (30), PRO_DAILY (300), ANON_IP_DAILY (500)  (text, optional)
//      PRO_EMAILS                        (text, optional)  emails that get Pro without paying, comma separated. For you, for testing.
//      REQUIRE_SIGNIN                    (text, optional)  set to 1 so only signed-in people can chat
// 3. Deploy, then paste the Worker's address into Coe > Settings.

const MOST = 8192;               // the longest reply it will ever ask for
const EXTRA = 1500;              // room for the model's own thinking, which counts against the limit
const BIGGEST = 4000000;         // the largest request it will read, in bytes
const TIERS = { swift: "MODEL_SWIFT", core: "MODEL_CORE", deep: "MODEL_DEEP" };
const DEFAULTS = { swift: "gpt-5-mini", core: "gpt-5", deep: "gpt-5" };
const COST = { swift: 1, core: 1, deep: 3 };          // credits a message costs
const REPLY = { free: 2048, pro: 8192 };              // longest reply by plan
const REDO = { free: 10, pro: 30 };                   // free "wrong? redo" a day

const json = (status, data, extra = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...extra } });
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

async function sha(text) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : "null",
      "Access-Control-Allow-Headers": "content-type, x-coe-code, x-coe-redo, authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Expose-Headers": "x-coe-used, x-coe-limit, x-coe-plan",
      "Vary": "Origin",
    };
    const reply = (status, data, extra) => json(status, data, { ...cors, ...extra });
    const fail = (status, message, code) => reply(status, { error: { message, ...(code ? { code } : {}) } });

    // ---- the database (Supabase), reached with the service key, only from here
    const sbUrl = (env.SUPABASE_URL || "").replace(/\/+$/, "");
    const billing = !!(sbUrl && env.SUPABASE_SERVICE_KEY);
    const sb = (p, init = {}) => fetch(sbUrl + p, { ...init, headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: "Bearer " + env.SUPABASE_SERVICE_KEY, "content-type": "application/json", ...(init.headers || {}) } });
    const limits = { free: num(env.FREE_DAILY, 30), pro: num(env.PRO_DAILY, 300), anon: num(env.ANON_IP_DAILY, 500) };
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
    if (!allowed.includes(origin)) return fail(403, "This site is not on the allowed list.");
    if (env.ACCESS_CODE && request.headers.get("x-coe-code") !== env.ACCESS_CODE) return fail(401, "That access code is not right.");

    // ---- who is asking: nobody, or a signed-in person
    let who = null;
    const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (bearer && sbUrl) {
      const r = await fetch(sbUrl + "/auth/v1/user", { headers: { apikey: env.SUPABASE_ANON_KEY || "", authorization: "Bearer " + bearer } });
      if (!r.ok) return fail(401, "Sign in again to use Coe.", "signin");
      const u = await r.json(); who = { id: u.id, email: u.email };
    }

    if (request.method === "GET" && path === "/me") {
      if (!billing) return reply(200, { billing: false, signedIn: !!who, plan: "free", used: 0, limit: limits.free });
      const pl = await planFor(who), plan = pl.plan;
      return reply(200, { billing: true, canBuy: !!env.STRIPE_SECRET_KEY, signedIn: !!who, email: who?.email, plan, given: !!pl.given, used: who ? await usedToday(who.id) : 0, limit: limits[plan], renews: pl.sub && plan === "pro" ? pl.sub.period_end : undefined });
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

    if (request.method !== "POST" || path !== "/") return fail(404, "Not found.");
    if (env.REQUIRE_SIGNIN && !who) return fail(401, "Sign in to use Coe.", "signin");
    if (Number(request.headers.get("content-length") || 0) > BIGGEST) return fail(413, "That is too much to send at once.");
    let body;
    try { body = await request.json(); } catch { return fail(400, "That request could not be read."); }
    if (!TIERS[body.model]) return fail(400, "That model is not allowed here.");
    if (!Array.isArray(body.messages) || !body.messages.length) return fail(400, "There is nothing to answer.");

    // ---- credits
    let plan = "free", subject = "", limit = 0, cost = 0, used = 0;
    if (billing) {
      plan = (await planFor(who)).plan;
      if (body.model === "deep" && plan !== "pro") return fail(403, "Coe Deep is part of Pro.", "plan");
      subject = who ? who.id : "ip:" + (await sha((request.headers.get("cf-connecting-ip") || "unknown") + (env.API_KEY || "")));
      limit = who ? limits[plan] : limits.anon;
      cost = COST[body.model];
      try {
        if (request.headers.get("x-coe-redo") === "1" && (await spend("redo:" + subject, 1, REDO[plan])) >= 0) cost = 0;
        if (cost > 0) {
          used = await spend(subject, cost, limit);
          if (used < 0) return fail(402, who ? `Your ${limit} credits for today are used up. They come back at midnight (UTC).${plan === "free" ? ` Pro has ${limits.pro} a day.` : ""}` : "Too many messages from this network today. Sign in, or try again tomorrow.", "credits");
        } else used = await usedToday(subject);
      } catch (e) { return fail(503, "Credits could not be checked just now. Try again in a moment."); }
    }

    const asked = Number(body.max_completion_tokens || body.max_tokens) || 1024;
    const cap = billing ? REPLY[plan] : MOST;
    const out = {
      model: env[TIERS[body.model]] || DEFAULTS[body.model],
      messages: body.messages,
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: Math.min(asked, cap) + EXTRA,
    };
    let upstream;
    try {
      upstream = await fetch(env.OPENAI_URL || "https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + env.API_KEY },
        body: JSON.stringify(out),
      });
    } catch (e) { upstream = null; }
    if (!upstream || !upstream.ok) {
      if (billing && cost > 0) await spend(subject, -cost, limit + cost).catch(() => {});   // a reply that never came costs nothing
      if (!upstream) return fail(502, "The model could not be reached. Try again in a moment.");
    }
    const credit = billing && who ? { "x-coe-used": String(upstream.ok ? used : Math.max(0, used - cost)), "x-coe-limit": String(limit), "x-coe-plan": plan } : {};
    return new Response(upstream.body, { status: upstream.status, headers: { ...cors, ...credit, "content-type": upstream.headers.get("content-type") || "application/json" } });
  },
};
