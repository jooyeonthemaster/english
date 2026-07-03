/**
 * Bank deposit-alert → SMOAT signature proxy (Cloudflare Worker)
 *
 * Why: an Android SMS forwarder (MacroDroid/Tasker) can POST plain JSON easily,
 * but cannot compute the HMAC-SHA256 signature that
 * /api/credits/top-ups/bank-notify requires. This tiny worker sits between them:
 * the phone authenticates with a simple bearer token, the worker re-signs the
 * body with the shared HMAC secret and forwards it to SMOAT.
 *
 * Deploy (Cloudflare):
 *   1. npm i -g wrangler && wrangler login
 *   2. cd tools/bank-notify-proxy
 *   3. wrangler secret put RELAY_SECRET      # == BANK_NOTIFY_RELAY_SECRET on SMOAT
 *   4. wrangler secret put INGEST_TOKEN      # phone -> worker bearer token (any random string)
 *   5. set TARGET_URL in wrangler.toml [vars]
 *   6. wrangler deploy
 *
 * Phone forwarder config:
 *   POST https://<worker-subdomain>.workers.dev/
 *   Header: Authorization: Bearer <INGEST_TOKEN>
 *   Body (JSON): { "text": "{sms_message}", "externalId": "{sms_id}" }
 */

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }

    // 1) Authenticate the phone with a simple bearer token.
    const auth = request.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!env.INGEST_TOKEN || token !== env.INGEST_TOKEN) {
      return new Response("unauthorized", { status: 401 });
    }

    // 2) Read the raw incoming body.
    const incoming = await request.text();
    const contentType = request.headers.get("content-type") || "";

    // 3) Build the JSON payload SMOAT expects.
    //    - If the phone already sent JSON, pass it through.
    //    - Otherwise (the easy/robust path) treat the whole body as the SMS
    //      text and wrap it with JSON.stringify, which escapes quotes/newlines
    //      so MacroDroid never has to produce valid JSON itself.
    let payload;
    if (contentType.includes("application/json") && looksLikeJson(incoming)) {
      payload = incoming;
    } else {
      const externalId = request.headers.get("x-external-id") || undefined;
      payload = JSON.stringify({ text: incoming, externalId });
    }

    // 4) HMAC-SHA256 sign the EXACT bytes we forward.
    const signature = await hmacHex(env.RELAY_SECRET, payload);

    // 5) Forward to SMOAT.
    const resp = await fetch(env.TARGET_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bank-notify-signature": `sha256=${signature}`,
      },
      body: payload,
    });

    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: { "Content-Type": "application/json" },
    });
  },
};

function looksLikeJson(s) {
  const t = s.trim();
  return t.startsWith("{") && t.endsWith("}");
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
