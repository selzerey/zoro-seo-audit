// Indexing and crawl rules: status, redirects, canonical, noindex, sitemap hygiene, robots.txt.
import { isAllowed } from "../robots.mjs";
import { canonicalOf, finding, indexable, noindex, robotsSources, uniformDay, xRobotsNoindex } from "./util.mjs";

/** rel=canonical from the HTTP Link header (Link: <https://…>; rel="canonical"), absolute, or null. */
export function headerCanonical(page) {
  const v = page.fetch.headers?.link ?? "";
  for (const m of v.matchAll(/<([^>]*)>([^,<]*)/g))
    if (/rel\s*=\s*"?canonical"?/i.test(m[2])) {
      try {
        return new URL(m[1], page.facts?.url ?? page.fetch.finalUrl).href;
      } catch {
        return null;
      }
    }
  return null;
}

/** Robots directive pairs that contradict each other (Google applies the most restrictive one). */
const OPPOSITE = [["index", "noindex"], ["follow", "nofollow"], ["all", "noindex"], ["all", "nofollow"], ["all", "none"], ["index", "none"]];

export default [
  {
    id: "status-error",
    severity: "error",
    tr: "Sayfa 200 dönmüyor",
    en: "Page does not return 200",
    check: ({ pages }) => [...pages].filter(([, p]) => p.fetch.status !== 200 && !p.blocked).map(([u, p]) => finding(u, `status ${p.fetch.status}`)),
  },
  {
    id: "redirect-chain",
    severity: "warn",
    tr: "Birden fazla yönlendirme adımı",
    en: "Redirect chain longer than one hop",
    check: ({ linkStatus }) => [...linkStatus].filter(([, s]) => s.chain.length > 2).map(([u, s]) => finding(u, s.chain.map((c) => c.status).join(" → "))),
  },
  {
    id: "canonical-missing",
    severity: "warn",
    tr: "Canonical etiketi yok",
    en: "No canonical tag",
    check: ({ pages }) => [...pages].filter(([, p]) => p.facts && !p.facts.canonicals.length && !noindex(p.facts)).map(([u]) => finding(u)),
  },
  {
    id: "canonical-multiple",
    severity: "error",
    tr: "Birden fazla canonical etiketi (Google hepsini yok sayar)",
    en: "Multiple canonical tags (Google ignores all of them)",
    check: ({ pages }) => [...pages].filter(([, p]) => (p.facts?.canonicals.length ?? 0) > 1).map(([u, p]) => finding(u, p.facts.canonicals.join(" | "))),
  },
  {
    id: "canonical-relative",
    severity: "info",
    tr: "Canonical göreli adres (mutlak adres önerilir)",
    en: "Canonical is a relative URL",
    check: ({ pages }) => [...pages].filter(([, p]) => p.facts?.canonicals.length === 1 && !/^https?:\/\//.test(p.facts.canonicals[0])).map(([u, p]) => finding(u, p.facts.canonicals[0])),
  },
  {
    id: "canonical-target-bad",
    severity: "error",
    tr: "Canonical hedefi 200 değil ya da yönlendiriyor",
    en: "Canonical target is not a 200 page",
    check: ({ pages, linkStatus }) =>
      [...pages].flatMap(([u, p]) => {
        const c = canonicalOf(p);
        if (!c || c === p.facts.url) return [];
        const s = linkStatus.get(c) ?? (pages.get(c) && { status: pages.get(c).fetch.status, chain: pages.get(c).fetch.chain });
        if (!s) return [];
        return s.chain.length > 1 || s.status !== 200 ? [finding(u, `${c} → ${s.chain.map((x) => x.status).join(" → ")}`)] : [];
      }),
  },
  {
    id: "canonical-elsewhere",
    severity: "info",
    tr: "Canonical başka bir adresi gösteriyor (bilerek mi?)",
    en: "Canonical points to another URL (intentional?)",
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => {
        const c = canonicalOf(p);
        return c && c !== p.facts.url ? [finding(u, c)] : [];
      }),
  },
  {
    id: "sitemap-not-indexable",
    severity: "error",
    tr: "Site haritasındaki adres dizine eklenemez (yönlendirme, hata, noindex ya da başka canonical)",
    en: "Sitemap URL is not indexable",
    check: ({ pages, sitemap }) =>
      [...pages].filter(([u, p]) => sitemap.urls.has(u) && !p.blocked && !(p.fetch.chain.length === 1 && indexable(p))).map(([u, p]) => {
        const why = p.fetch.chain.length > 1 ? `redirect → ${p.fetch.finalUrl}` : p.fetch.status !== 200 ? `status ${p.fetch.status}` : noindex(p.facts ?? {}) || xRobotsNoindex(p.fetch.headers) ? "noindex" : `canonical ${canonicalOf(p)}`;
        return finding(u, why);
      }),
  },
  {
    id: "sitemap-robots-blocked",
    severity: "error",
    tr: "Site haritasındaki adres robots.txt ile engelli",
    en: "Sitemap URL blocked by robots.txt",
    check: ({ sitemap, robots }) => [...sitemap.urls.keys()].filter((u) => !isAllowed(robots, "Googlebot", u)).slice(0, 200).map((u) => finding(u)),
  },
  {
    id: "sitemap-missing",
    severity: "warn",
    tr: "Site haritası bulunamadı ya da okunamadı",
    en: "No readable sitemap",
    check: ({ sitemap, origin }) => (sitemap.urls.size ? [] : [finding(origin, sitemap.problems.map((p) => `${p.sitemap} ${p.status}`).join(", ") || "robots.txt has no Sitemap line")]),
  },
  {
    id: "sitemap-lastmod-future",
    severity: "warn",
    tr: "Site haritasında gelecek tarihli lastmod",
    en: "Sitemap lastmod in the future",
    check: ({ sitemap }) => {
      const now = Date.now() + 36e5 * 24;
      return [...sitemap.urls].filter(([, d]) => d && Date.parse(d) > now).slice(0, 50).map(([u, d]) => finding(u, d));
    },
  },
  {
    id: "sitemap-lastmod-uniform",
    severity: "warn",
    tr: "Site haritasında lastmod değerlerinin %90'ı ya da fazlası aynı gün: tarih her derlemede ya da istekte yeniden basılıyor. Google lastmod'a ancak doğruysa güvenir; yalnız ana içerik değişince güncelle",
    en: "90%+ of sitemap lastmod values fall on one day: stamped at build or request time. Google trusts lastmod only when it is accurate; change it only when main content changes",
    site: true,
    check: ({ sitemap, origin }) => {
      const u = uniformDay([...sitemap.urls.values()].filter(Boolean).map((d) => d.slice(0, 10)));
      if (!u) return [];
      const today = new Date().toISOString().slice(0, 10);
      return [finding(sitemap.sitemaps?.[0] ?? origin, `${u.n}/${u.of} lastmod = ${u.day}${u.day === today ? " (today: generated per request?)" : ""}`)];
    },
  },
  {
    id: "canonical-header-conflict",
    severity: "warn",
    tr: "HTML canonical ile HTTP Link: rel=canonical başlığı farklı adres söylüyor: Google çelişen canonical'ları yok sayabilir",
    en: "HTML canonical and the HTTP Link: rel=canonical header disagree: Google may ignore conflicting canonicals",
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => {
        const h = p.facts && headerCanonical(p);
        const c = canonicalOf(p);
        return h && c && h !== c ? [finding(u, `HTML ${c} vs header ${h}`)] : [];
      }),
  },
  {
    id: "canonical-outside-head",
    severity: "warn",
    tr: "rel=canonical <body> içinde: Google body'deki canonical'ı yok sayar. <head> içine taşı",
    en: "rel=canonical inside <body>: Google ignores a canonical there. Move it into <head>",
    check: ({ pages }) => [...pages].filter(([, p]) => p.facts?.head?.bodyCanonicals).map(([u, p]) => finding(u, `${p.facts.head.bodyCanonicals} canonical tag(s) after </head>`)),
  },
  {
    id: "canonical-noindex-conflict",
    severity: "warn",
    tr: "Canonical ile noindex/robots çelişiyor: noindex sayfa başka adrese canonical veriyor ya da canonical hedefi noindex veya robots.txt ile yasak. Tek sinyal seç",
    en: "Canonical conflicts with noindex/robots: a noindex page canonicalises elsewhere, or the canonical target is noindex or blocked by robots.txt. Pick one signal",
    check: ({ pages, robots }) => {
      const out = [];
      const mixed = new Map(); // canonical target → noindex pages pointing at it (parameter variants come in dozens)
      for (const [u, p] of pages) {
        const c = canonicalOf(p);
        if (!c || c === p.facts.url) continue;
        const t = pages.get(c);
        if (noindex(p.facts) || xRobotsNoindex(p.fetch.headers)) mixed.set(c, [...(mixed.get(c) ?? []), u]);
        else if (t?.facts && (noindex(t.facts) || xRobotsNoindex(t.fetch.headers))) out.push(finding(u, `canonical target ${c} is noindex`));
        else if (!isAllowed(robots, "Googlebot", c)) out.push(finding(u, `canonical target ${c} blocked by robots.txt`));
      }
      for (const [c, us] of mixed) out.push(finding(us[0], `noindex + canonical → ${c}${us.length > 1 ? ` (${us.length} pages, e.g. ${us.slice(1, 3).join(", ")})` : ""}`));
      return out;
    },
  },
  {
    id: "canonical-chain",
    severity: "warn",
    tr: "Canonical zinciri ya da döngüsü (A → B, B → C): Google zinciri izlemeyebilir; her sayfa canonical'ı doğrudan son adrese versin",
    en: "Canonical chain or loop (A → B, B → C): Google may not follow it; point every canonical at the final URL",
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => {
        const path = [u];
        let c = canonicalOf(p);
        while (c && c !== path.at(-1) && pages.get(c)?.facts) {
          if (path.includes(c)) return [finding(u, `loop: ${[...path, c].join(" → ")}`)];
          path.push(c);
          c = canonicalOf(pages.get(c));
        }
        return path.length > 2 ? [finding(u, path.join(" → "))] : [];
      }),
  },
  {
    id: "head-invalid-element",
    severity: "error",
    tr: "<head> içinde geçersiz öğe (div, img, iframe, düz metin ya da noscript içinde img/iframe): tarayıcı ve Google head'i orada kapatır, sonraki canonical/robots/hreflang/description yok sayılır",
    en: "Invalid element in <head> (div, img, iframe, stray text, or img/iframe inside noscript): browsers and Google end the head there and ignore the canonical/robots/hreflang/description after it",
    check: ({ pages }) => [...pages].filter(([, p]) => p.facts?.head?.lost.length).map(([u, p]) => finding(u, `${p.facts.head.invalid} ends <head>; lost: ${[...new Set(p.facts.head.lost)].join(", ")}`)),
  },
  {
    id: "head-duplicate-meta",
    severity: "warn",
    tr: "Birden çok <title> ya da meta description (SVG içindeki <title> sayılmaz): hangisinin kullanılacağı belirsiz",
    en: "More than one <title> or meta description (SVG <title> excluded): which one is used is undefined",
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => {
        const f = p.facts;
        if (!f || ((f.pageTitles ?? 0) <= 1 && (f.descriptionCount ?? 0) <= 1)) return [];
        return [finding(u, [f.pageTitles > 1 && `${f.pageTitles} titles`, f.descriptionCount > 1 && `${f.descriptionCount} descriptions`].filter(Boolean).join(", "))];
      }),
  },
  {
    id: "charset-missing",
    severity: "warn",
    tr: "Karakter kodlaması bildirilmemiş: Content-Type başlığında charset yok ve <meta charset> ilk 1024 baytta değil. Türkçe harfler bozuk görünebilir",
    en: "No character encoding: no charset in the Content-Type header and no <meta charset> in the first 1024 bytes. Non-ASCII letters may break",
    check: ({ pages }) =>
      [...pages]
        .filter(([, p]) => p.facts && p.facts.charset !== "early" && !/charset=/i.test(p.fetch.headers?.["content-type"] ?? ""))
        .map(([u, p]) => finding(u, p.facts.charset === "late" ? "<meta charset> after byte 1024" : "none")),
  },
  {
    id: "viewport-missing",
    severity: "warn",
    tr: "Viewport meta yok, birden çok ya da width=device-width değil: mobil öncelikli dizinde sayfa masaüstü genişliğinde çizilir",
    en: "Viewport meta missing, duplicated or not width=device-width: with mobile-first indexing the page renders at desktop width",
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => {
        const v = p.facts?.viewports;
        if (!v) return [];
        if (!v.length) return [finding(u, "missing")];
        if (v.length > 1) return [finding(u, `${v.length} viewport tags`)];
        return /width\s*=\s*device-width/i.test(v[0]) ? [] : [finding(u, v[0])];
      }),
  },
  {
    id: "snippet-restricted",
    severity: "warn",
    tr: "Snippet kısıtlı: nosnippet, max-snippet 0-49 ya da ana metnin yarısından çoğu data-nosnippet içinde. Arama sonucu açıklaması ve AI Overviews alıntısı kesilir (max-snippet:-1 sınırsızdır, sorun değil)",
    en: "Snippet restricted: nosnippet, max-snippet 0-49, or most of the main text inside data-nosnippet. Cuts the result snippet and AI Overviews quotes (max-snippet:-1 means unlimited, fine)",
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => {
        if (!indexable(p)) return [];
        const why = [];
        for (const s of robotsSources(p))
          for (const d of s.list) {
            const n = /^max-snippet:(-?\d+)/.exec(d)?.[1];
            if (d === "nosnippet" || (n != null && Number(n) >= 0 && Number(n) < 50)) why.push(`${s.src}: ${d}`);
          }
        const chars = p.facts.text.length;
        if (chars >= 200 && (p.facts.nosnippetChars ?? 0) / chars >= 0.5) why.push(`data-nosnippet wraps ${Math.round((p.facts.nosnippetChars / chars) * 100)}% of the text`);
        return why.length ? [finding(u, why.join("; "))] : [];
      }),
  },
  {
    id: "robots-directive-conflict",
    severity: "warn",
    tr: "Robots yönergeleri çelişiyor (ör. bir meta index, X-Robots-Tag noindex; ya da iki robots meta etiketi zıt şey söylüyor). Google en kısıtlayıcı olanı uygular; tek kaynakta tek karar bırak",
    en: "Robots directives contradict (e.g. a meta says index, X-Robots-Tag says noindex, or two robots meta tags disagree). Google applies the most restrictive; keep one decision in one place",
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => {
        if (!p.facts) return [];
        const src = robotsSources(p);
        const where = (d) => src.filter((s) => s.list.includes(d)).map((s) => s.src);
        const hits = OPPOSITE.filter(([a, b]) => where(a).length && where(b).length).map(([a, b]) => `${a} (${where(a).join(", ")}) vs ${b} (${where(b).join(", ")})`);
        return hits.length ? [finding(u, hits.join("; "))] : [];
      }),
  },
  {
    id: "noindex-linked",
    severity: "info",
    tr: "noindex sayfa (bilerek mi?)",
    en: "noindex page (intentional?)",
    check: ({ pages }) => [...pages].filter(([, p]) => p.facts && (noindex(p.facts) || xRobotsNoindex(p.fetch.headers))).map(([u]) => finding(u)),
  },
  {
    id: "lang-missing",
    severity: "warn",
    tr: "<html lang> yok",
    en: "<html lang> missing",
    check: ({ pages }) => [...pages].filter(([, p]) => p.facts && !p.facts.lang).map(([u]) => finding(u)),
  },
  {
    id: "mixed-content",
    severity: "error",
    tr: "HTTPS sayfada http:// kaynak yükleniyor",
    en: "HTTPS page loads http:// resources",
    check: ({ pages }) => [...pages].filter(([, p]) => p.facts?.mixedContent.length).map(([u, p]) => finding(u, p.facts.mixedContent.slice(0, 3).join(", "))),
  },
  {
    id: "slow-response",
    severity: "info",
    tr: "Sunucu yanıtı 1 saniyeden yavaş (tek ölçüm; tekrar ölç)",
    en: "Server response slower than 1 s (single sample; re-measure)",
    check: ({ pages }) => [...pages].filter(([, p]) => p.fetch.ms > 1000).map(([u, p]) => finding(u, `${p.fetch.ms} ms`)),
  },
  {
    id: "sitemap-query-url",
    severity: "info",
    tr: "Site haritasında sorgu parametreli adres (?…): çoğu zaman filtre/sıralama kopyasıdır; kendi canonical'ı olan bilinçli bir sayfa mı, kontrol et",
    en: "Query-string URL in the sitemap (?…): often a filter/sort duplicate; confirm it is a deliberate self-canonical page",
    check: ({ sitemap }) => [...sitemap.urls.keys()].filter((u) => new URL(u).search).map((u) => finding(u)),
  },
  {
    id: "content-extractability",
    severity: "warn",
    tr: "Ham HTML'de içerik yok: boş uygulama kökü (#root/#__next/#app…) ya da yalnız script. Metin JavaScript ile geliyor; Google geç işler, çoğu yapay zekâ botu JS çalıştırmaz. Sunucu tarafında (SSR/SSG) içerik gönder",
    en: "No content in the raw HTML: empty app root (#root/#__next/#app…) or scripts only. Text arrives via JavaScript; Google renders late and most AI bots do not run JS. Serve content server-side (SSR/SSG)",
    // Limits adapted from seomator-geo-audit thresholds.json (extractability), Copyright (c) 2026 SEOmator — MIT.
    check: ({ pages }) =>
      [...pages].flatMap(([u, p]) => {
        const s = p.facts?.shell;
        if (!s || noindex(p.facts)) return [];
        const shell = (s.emptyRoot && s.chars < 1200) || (!s.hasMain && s.chars < 50 && s.scripts > 0);
        return shell ? [finding(u, `${s.emptyRoot ? `#${s.emptyRoot} empty, ` : ""}${s.chars} visible chars${s.hasMain ? "" : ", no <main>"}`)] : [];
      }),
  },
];
