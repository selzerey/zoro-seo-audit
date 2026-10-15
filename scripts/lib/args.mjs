import fs from "node:fs";
import { fileURLToPath } from "node:url";
// Minimal argv parser: positionals in `_`, `--key value`, boolean flags listed in `flags`.
export function parseArgs(argv, flags = ["quiet", "dry-run"]) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith("--")) a._.push(k);
    else if (flags.includes(k.slice(2))) a[k.slice(2)] = true;
    else a[k.slice(2)] = argv[++i];
  }
  return a;
}

/** true when the module is the script being run (also through a symlink/junction, e.g. ~/.claude/skills). */
export function isMain(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
