// Google OAuth (installed-app refresh token) + JSON requests. Credentials from env (see .env.example):
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN, or
//   GOOGLE_OAUTH_JSON (client file from Cloud Console) + GOOGLE_TOKEN_JSON (file with refresh_token).
// Values are never printed.
import fs from "node:fs";

export function googleCreds(env) {
  let id = env.GOOGLE_CLIENT_ID;
  let secret = env.GOOGLE_CLIENT_SECRET;
  let refresh = env.GOOGLE_REFRESH_TOKEN;
  if ((!id || !secret) && env.GOOGLE_OAUTH_JSON) {
    const j = JSON.parse(fs.readFileSync(env.GOOGLE_OAUTH_JSON, "utf8"));
    const c = j.installed ?? j.web ?? j;
    id ??= c.client_id;
    secret ??= c.client_secret;
  }
  if (!refresh && env.GOOGLE_TOKEN_JSON) refresh = JSON.parse(fs.readFileSync(env.GOOGLE_TOKEN_JSON, "utf8")).refresh_token;
  if (!id || !secret || !refresh) throw new Error("Google credentials missing: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN (or the *_JSON file paths). See references/api-setup.md");
  return { id, secret, refresh };
}

export function googleClient(env, { fetchImpl = fetch } = {}) {
  let cached = null;
  async function token() {
    if (cached && cached.exp > Date.now() + 60_000) return cached.t;
    const c = googleCreds(env);
    const r = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, refresh_token: c.refresh, grant_type: "refresh_token" }),
    });
    const j = await r.json();
    if (!j.access_token) throw new Error(`Google token refresh failed: ${j.error ?? r.status} ${j.error_description ?? ""}`);
    cached = { t: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    return cached.t;
  }
  return async function g(method, url, body) {
    const r = await fetchImpl(url, {
      method,
      headers: { authorization: `Bearer ${await token()}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!r.ok) throw new Error(`${method} ${url} -> ${r.status}: ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`);
    return data;
  };
}
