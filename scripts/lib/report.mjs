// Markdown and JSON output. Each issue lists a few example URLs; the JSON keeps everything.
const L = {
  tr: { title: "SEO denetimi", pages: "taranan sayfa", sitemap: "site haritası adresi", none: "Sorun bulunmadı.", more: "daha", sev: { error: "Hata", warn: "Uyarı", info: "Bilgi" }, verify: "Uygulamadan önce: references/false-positives.md" },
  en: { title: "SEO audit", pages: "pages crawled", sitemap: "sitemap URLs", none: "No issues found.", more: "more", sev: { error: "Error", warn: "Warning", info: "Info" }, verify: "Before acting: references/false-positives.md" },
};

export function toMarkdown(ctx, results, { lang = "en", examples = 5 } = {}) {
  const t = L[lang] ?? L.en;
  const count = (s) => results.filter((r) => r.severity === s).length;
  const lines = [
    `# ${t.title}: ${ctx.start}`,
    "",
    `${new Date().toISOString().slice(0, 10)} · ${ctx.pages.size} ${t.pages} · ${ctx.sitemap.urls.size} ${t.sitemap} · ${t.sev.error} ${count("error")} · ${t.sev.warn} ${count("warn")} · ${t.sev.info} ${count("info")}`,
    "",
    `> ${t.verify}`,
    "",
  ];
  if (!results.length) lines.push(t.none);
  for (const sev of ["error", "warn", "info"]) {
    const group = results.filter((r) => r.severity === sev);
    if (!group.length) continue;
    lines.push(`## ${t.sev[sev]}`, "");
    for (const r of group) {
      lines.push(`### ${r[lang] ?? r.en} \`${r.id}\` (${r.findings.length})`);
      for (const f of r.findings.slice(0, examples)) lines.push(`- ${f.url}${f.detail ? ` — ${f.detail}` : ""}`);
      if (r.findings.length > examples) lines.push(`- … +${r.findings.length - examples} ${t.more}`);
      lines.push("");
    }
  }
  if (ctx.uncheckedLinks > 0) lines.push(`_${ctx.uncheckedLinks} internal link target(s) not checked (raise --check-links)._`);
  return lines.join("\n");
}

export function toJson(ctx, results) {
  return JSON.stringify(
    {
      start: ctx.start,
      date: new Date().toISOString(),
      pagesCrawled: ctx.pages.size,
      sitemapUrls: ctx.sitemap.urls.size,
      summary: Object.fromEntries(["error", "warn", "info"].map((s) => [s, results.filter((r) => r.severity === s).length])),
      issues: results,
    },
    null,
    2,
  );
}
