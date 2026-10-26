import { DurableObject } from "cloudflare:workers";

const MODEL = "gemini-3.5-flash-lite";
const MAX_BODY_BYTES = 100_000;
const DAILY_LIMIT = 100;

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
      "Cache-Control": "no-store"
    }
  });
}

export class DailyQuota extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);

    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS daily_quota (
        day TEXT PRIMARY KEY,
        count INTEGER NOT NULL
      )
    `);
  }

  async reserve() {
    const day = new Date().toISOString().slice(0, 10);

    return this.ctx.storage.transactionSync(() => {
      const row = this.ctx.storage.sql
        .exec("SELECT count FROM daily_quota WHERE day = ?", day)
        .toArray()[0];

      const count = row ? row.count : 0;

      if (count >= DAILY_LIMIT) {
        return { allowed: false, remaining: 0 };
      }

      this.ctx.storage.sql.exec(
        `INSERT INTO daily_quota (day, count)
         VALUES (?, 1)
         ON CONFLICT(day) DO UPDATE SET count = count + 1`,
        day
      );

      this.ctx.storage.sql.exec(
        "DELETE FROM daily_quota WHERE day < ?",
        day
      );

      return {
        allowed: true,
        remaining: DAILY_LIMIT - count - 1
      };
    });
  }
}

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN;

    if (!allowedOrigin || !env.APPROVED_MODELS) {
      return new Response("Worker configuration is incomplete.", {
        status: 500
      });
    }

    const origin = request.headers.get("Origin");

    if (origin !== allowedOrigin) {
      return new Response("Origin not allowed.", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, 405, allowedOrigin);
    }

    if (!env.GEMINI_API_KEY || !env.TURNSTILE_SECRET_KEY) {
      return json({ error: "Worker secrets are not configured." }, 500, allowedOrigin);
    }

    if (!env.DAILY_QUOTA || !env.RATE_LIMITER) {
      return json({ error: "Worker bindings are not configured." }, 500, allowedOrigin);
    }

    const contentType = request.headers.get("Content-Type") || "";

    if (!contentType.toLowerCase().includes("application/json")) {
      return json({ error: "Content-Type must be application/json." }, 415, allowedOrigin);
    }

    const length = Number(request.headers.get("Content-Length") || 0);

    if (length > MAX_BODY_BYTES) {
      return json({ error: "Request is too large." }, 413, allowedOrigin);
    }

    let payload;

    try {
      const raw = await request.text();

      if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
        return json({ error: "Request is too large." }, 413, allowedOrigin);
      }

      payload = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid JSON." }, 400, allowedOrigin);
    }

    const token = payload?.turnstileToken;
    const body = payload?.body;

    if (typeof token !== "string" || token.length < 1 || token.length > 2048) {
      return json({ error: "Please complete the security check." }, 400, allowedOrigin);
    }

    if (
      !body ||
      typeof body !== "object" ||
      !Array.isArray(body.contents) ||
      body.contents.length === 0
    ) {
      return json({ error: "Invalid Gemini request." }, 400, allowedOrigin);
    }

    const approvedModels = env.APPROVED_MODELS
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean);

    if (!approvedModels.includes(MODEL)) {
      return json({ error: "The configured model is not approved." }, 500, allowedOrigin);
    }

    // Reject unknown top-level Gemini fields rather than forwarding arbitrary input.
    const permittedFields = new Set([
      "contents",
      "systemInstruction",
      "generationConfig",
      "safetySettings",
      "tools",
      "toolConfig"
    ]);

    if (Object.keys(body).some((key) => !permittedFields.has(key))) {
      return json({ error: "Unsupported request fields." }, 400, allowedOrigin);
    }

    if (body.contents.length > 100) {
      return json({ error: "Too many content items." }, 400, allowedOrigin);
    }

    // Approximate burst protection. Cloudflare rate limits are not a strict global cap.
    const rate = await env.RATE_LIMITER.limit({
      key: "exam-study-app"
    });

    if (!rate.success) {
      return json({ error: "Too many requests. Please wait a minute." }, 429, allowedOrigin);
    }

    // Verify the Turnstile token with Cloudflare.
    let verification;

    try {
      const verifyResponse = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            secret: env.TURNSTILE_SECRET_KEY,
            response: token
          })
        }
      );

      if (!verifyResponse.ok) {
        return json({ error: "Security verification is temporarily unavailable." }, 502, allowedOrigin);
      }

      verification = await verifyResponse.json();
    } catch {
      return json({ error: "Security verification is temporarily unavailable." }, 502, allowedOrigin);
    }

    if (
      !verification.success ||
      verification.hostname !== "cassidyjames011-coder.github.io" ||
      verification.action !== "generate"
    ) {
      return json({ error: "Security verification failed. Please try again." }, 403, allowedOrigin);
    }

    // Reserve a daily request before calling Gemini.
    // Failed upstream attempts still count toward the daily cap.
    const quotaId = env.DAILY_QUOTA.idFromName("global-daily-quota");
    const quota = env.DAILY_QUOTA.get(quotaId);

    let reservation;

    try {
      reservation = await quota.reserve();
    } catch {
      return json({ error: "Quota service is temporarily unavailable." }, 503, allowedOrigin);
    }

    if (!reservation.allowed) {
      return json({ error: "The daily request limit has been reached. Try again tomorrow." }, 429, allowedOrigin);
    }

    const upstreamBody = {
      contents: body.contents
    };

    for (const field of [
      "systemInstruction",
      "generationConfig",
      "safetySettings",
      "tools",
      "toolConfig"
    ]) {
      if (body[field] !== undefined) {
        upstreamBody[field] = body[field];
      }
    }

    try {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY
          },
          body: JSON.stringify(upstreamBody)
        }
      );

      const result = await upstream.text();

      return new Response(result, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") || "application/json",
          "Access-Control-Allow-Origin": allowedOrigin,
          "Vary": "Origin",
          "Cache-Control": "no-store",
          "X-Daily-Quota-Remaining": String(reservation.remaining)
        }
      });
    } catch {
      return json({ error: "Gemini is temporarily unavailable. Please try again." }, 502, allowedOrigin);
    }
  }
};
