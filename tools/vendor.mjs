// Bundles node-html-parser (and its dependencies) into scripts/lib/vendor/ so the skill runs without `npm install`.
// Run after changing the parser version: npm run vendor
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "scripts/lib/vendor");
const pkgs = ["node-html-parser", "css-select", "css-what", "domhandler", "domutils", "dom-serializer", "domelementtype", "entities", "nth-check", "boolbase", "he"];
const meta = pkgs.map((name) => {
  const dir = path.join(root, "node_modules", name);
  const p = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  const lic = fs.readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
  return { name, version: p.version, license: p.license, text: lic ? fs.readFileSync(path.join(dir, lic), "utf8").trim() : "" };
});
const banner = `// Bundled with esbuild from ${meta.map((m) => `${m.name}@${m.version} (${m.license})`).join(", ")}.\n// Licenses: scripts/lib/vendor/LICENSES.md. Regenerate with: npm run vendor`;
await build({
  stdin: { contents: 'export { parse, HTMLElement, TextNode, NodeType } from "node-html-parser";', resolveDir: root },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  minify: true,
  legalComments: "none",
  banner: { js: banner },
  outfile: path.join(out, "node-html-parser.mjs"),
});
fs.writeFileSync(
  path.join(out, "LICENSES.md"),
  `# Bundled third-party code\n\n\`node-html-parser.mjs\` contains the following packages.\n\n${meta.map((m) => `## ${m.name} ${m.version} — ${m.license}\n\n\`\`\`\n${m.text || `${m.license} License`}\n\`\`\``).join("\n\n")}\n`,
);
console.log(`vendor: ${meta.length} packages`);
