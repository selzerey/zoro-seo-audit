#!/usr/bin/env node
// One-time Google consent for Search Console (read + URL inspection). Writes a refresh token file.
// Usage: node scripts/google-auth.mjs --client path/to/client_secret.json --out path/to/google-token.json [--port 53682]
// Client: Cloud Console > APIs & Services > Credentials > OAuth client ID > "Desktop app"; enable "Google Search Console API".
// Publish the consent screen ("In production") or the refresh token expires after 7 days.
import fs from "node:fs";
import http from "node:http";
import { pathToFileURL } from "node:url";
import { parseArgs } from "./lib/args.mjs";

const SCOPES = ["https://www.googleapis.com/auth/webmasters"];

export function authUrl(clientId, redirect) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", scope: SCOPES.join(" "), access_type: "offline", prompt: "consent" });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export async function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv);
  if (!a.client || !a.out) throw new Error("usage: --client client_secret.json --out google-token.json");
  const c = JSON.parse(fs.readFileSync(a.client, "utf8"));
  const { client_id, client_secret } = c.installed ?? c.web ?? c;
  const port = Number(a.port ?? 53682);
  const redirect = `http://127.0.0.1:${port}/`;
  console.log("Open this URL in a browser and allow access:\n\n" + authUrl(client_id, redirect) + "\n");
  const code = await new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, redirect);
      const code = u.searchParams.get("code");
      res.end(code ? "OK - you can close this tab." : "No code.");
      srv.close();
      code ? resolve(code) : reject(new Error(u.searchParams.get("error") ?? "no code"));
    });
    srv.listen(port, "127.0.0.1");
  });
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id, client_secret, redirect_uri: redirect, grant_type: "authorization_code" }),
  });
  const j = await r.json();
  if (!j.refresh_token) throw new Error(`no refresh_token: ${j.error ?? r.status}`);
  fs.writeFileSync(a.out, JSON.stringify({ refresh_token: j.refresh_token, scope: j.scope }, null, 2), { mode: 0o600 });
  console.log(`saved refresh token to ${a.out} (keep it out of git)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
