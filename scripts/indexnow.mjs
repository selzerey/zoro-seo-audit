#!/usr/bin/env node
// IndexNow (Bing, Yandex, Seznam, Naver; Google does not use it). Usage:
//   node scripts/indexnow.mjs check  --host example.com
//   node scripts/indexnow.mjs submit --host example.com <url> [<url> ...] [--file urls.txt] [--dry-run]
// INDEXNOW_KEY from env; the key file must be served at https://<host>/<key>.txt (or INDEXNOW_KEY_LOCATION).
// Submit only new or really changed URLs; resubmitting unchanged pages wastes trust.
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "./lib/args.mjs";
import { loadEnv } from "./lib/env.mjs";

export function payload({ host, key, keyLocation, urls }) {
  const own = urls.filter((u) => new URL(u).host === host);
  if (own.length !== urls.length) throw new Error(`${urls.length - own.length} URL(s) are not on ${host}`);
  if (own.length > 10000) throw new Error("max 10,000 URLs per request");
  return { host, key, keyLocation: keyLocation ?? `https://${host}/${key}.txt`, urlList: own };
}

export async function main(argv = process.argv.slice(2)) {
  const env = loadEnv();
  const a = parseArgs(argv);
  const [cmd, ...rest] = a._;
  const host = a.host ?? env.INDEXNOW_HOST;
  const key = env.INDEXNOW_KEY;
  if (!host || !key) throw new Error("--host (or INDEXNOW_HOST) and INDEXNOW_KEY are required");
  const keyLocation = env.INDEXNOW_KEY_LOCATION ?? `https://${host}/${key}.txt`;

  if (cmd === "check") {
    const r = await fetch(keyLocation);
    const body = (await r.text()).trim();
    const ok = r.status === 200 && body === key;
    console.log(ok ? `key file OK (${keyLocation})` : `key file NOT OK: status ${r.status}, content ${body === key ? "matches" : "does not match"}`);
    process.exitCode = ok ? 0 : 1;
    return;
  }
  if (cmd === "submit") {
    const urls = [...rest, ...(a.file ? fs.readFileSync(a.file, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [])];
    if (!urls.length) throw new Error("no URLs given");
    const body = payload({ host, key, keyLocation, urls });
    if (a["dry-run"]) return console.log(`dry run: would submit ${body.urlList.length} URL(s) for ${host}`);
    const r = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body) });
    // 200 = accepted, 202 = accepted, key validation pending; 403 = key file wrong; 422 = URL/host mismatch; 429 = too often.
    console.log(`IndexNow ${r.status}: ${body.urlList.length} URL(s)`);
    process.exitCode = r.status === 200 || r.status === 202 ? 0 : 1;
    return;
  }
  throw new Error("use: check | submit");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
