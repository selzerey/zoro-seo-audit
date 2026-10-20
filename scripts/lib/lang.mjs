// Language packs for the few rules that read words: AI clichés, sentence abbreviations, "page not found" wording,
// legal/contact page slugs, past-tense context and bot-check pages. A page uses the pack of its <html lang>;
// pages without a known language are checked against every pack. Adding a language = one entry below + a test.

export const PACKS = {
  en: {
    cliches: ["in today's fast-paced", "in today's world", "in today's digital", "delve into", "it is important to note", "it's important to note", "in conclusion", "navigating the", "a testament to", "plays a crucial role", "unlock the", "seamless", "embark on", "ever-evolving", "comprehensive guide", "look no further", "game-changer", "tapestry of", "in the realm of", "elevate your"],
    abbr: ["e.g", "i.e", "mr", "mrs", "ms", "dr", "prof", "st", "vs", "etc", "no", "fig", "approx", "inc", "ltd", "jr", "sr", "vol", "pp", "cf"],
    notFound: ["page not found", "not found", "page doesn't exist", "page does not exist", "no longer available"],
    utility: ["privacy", "terms", "cookie", "contact", "about", "legal", "help", "faq", "imprint", "disclaimer", "accessibility"],
    history: ["previous", "former", "last year", "history", "was"],
    challenge: ["captcha", "verify you are human", "just a moment", "access denied", "attention required", "checking your browser"],
  },
  tr: {
    cliches: ["günümüzde", "günümüz dünyasında", "hızla değişen", "sonuç olarak", "özetle", "unutmamak gerekir ki", "unutulmamalıdır ki", "önemle belirtmek gerekir", "bu yazımızda", "bu makalede", "detaylı bir şekilde", "kapsamlı bir rehber", "hayati önem taşır", "büyük önem taşımaktadır", "göz önünde bulundurulmalıdır", "son derece önemlidir", "dikkat edilmesi gereken", "merak edilen", "sizler için", "yolculuğunuzda", "dünyasına", "kilit rol oynar", "ayrılmaz bir parçası", "vazgeçilmez"],
    abbr: ["ör", "örn", "vb", "vs", "bkz", "bk", "krş", "dr", "prof", "doç", "yrd", "av", "op", "hz", "yy", "sn", "no", "md", "mad", "s", "sf", "c", "t.c", "m.ö", "m.s", "çev", "haz", "yay", "cad", "sok", "mah", "apt", "tel", "st"],
    notFound: ["sayfa bulunamad", "aradığınız sayfa", "sayfa mevcut değil", "sayfa yok"],
    utility: ["gizlilik", "kvkk", "cerez", "çerez", "aydinlatma", "kullanim", "kosullar", "sartlar", "iletisim", "hakkimizda", "hakkinda", "kunye", "sss", "yardim"],
    history: ["geçmiş", "önceki", "eski", "tarihçe", "geçen yıl", "iken", "idi"],
    challenge: ["robot olmadığ", "doğrulama", "güvenlik kontrolü"],
  },
  de: {
    cliches: ["in der heutigen schnelllebigen", "in der heutigen zeit", "in der heutigen welt", "es ist wichtig zu beachten", "es ist wichtig zu betonen", "zusammenfassend lässt sich sagen", "abschließend lässt sich sagen", "tauchen wir ein", "eine entscheidende rolle", "ein umfassender leitfaden", "nahtlos", "ständig weiterentwickelnden", "nicht zuletzt", "von entscheidender bedeutung"],
    abbr: ["z.b", "bzw", "usw", "ca", "dr", "prof", "nr", "str", "vgl", "ggf", "inkl", "d.h", "u.a", "evtl", "bspw", "s", "abs", "jh", "hr", "fr"],
    notFound: ["seite nicht gefunden", "seite wurde nicht gefunden", "seite existiert nicht", "nicht mehr verfügbar"],
    utility: ["datenschutz", "impressum", "kontakt", "agb", "nutzungsbedingungen", "ueber-uns", "uber-uns", "hilfe", "barrierefreiheit"],
    history: ["früher", "ehemals", "vorherige", "letztes jahr", "geschichte", "war"],
    challenge: ["sicherheitsüberprüfung", "bestätigen sie, dass sie ein mensch sind", "zugriff verweigert"],
  },
  fr: {
    cliches: ["dans le monde d'aujourd'hui", "dans le monde actuel", "de nos jours", "il est important de noter", "il convient de noter", "en conclusion", "plongeons dans", "un rôle crucial", "un guide complet", "en constante évolution", "sans couture", "n'hésitez pas à"],
    abbr: ["m", "mme", "mlle", "dr", "pr", "etc", "p.ex", "cf", "env", "n°", "no", "av", "bd", "st", "ste", "vol", "p", "chap"],
    notFound: ["page introuvable", "page non trouvée", "cette page n'existe pas", "la page demandée", "n'est plus disponible"],
    utility: ["mentions-legales", "confidentialite", "politique-de-confidentialite", "cgu", "cgv", "contact", "a-propos", "qui-sommes-nous", "aide", "accessibilite"],
    history: ["auparavant", "précédent", "ancien", "l'année dernière", "historique", "était"],
    challenge: ["vérifiez que vous êtes humain", "vérification de sécurité", "accès refusé"],
  },
  es: {
    cliches: ["en el mundo actual", "en la actualidad", "hoy en día", "es importante destacar", "es importante tener en cuenta", "en conclusión", "sumérgete en", "adentrémonos en", "un papel crucial", "una guía completa", "en constante evolución", "sin fisuras", "cabe destacar que"],
    abbr: ["sr", "sra", "srta", "dr", "dra", "ud", "uds", "etc", "p.ej", "pág", "núm", "no", "av", "c", "aprox", "vol", "cap"],
    notFound: ["página no encontrada", "no se encontró la página", "la página que buscas", "la página no existe", "ya no está disponible"],
    utility: ["privacidad", "politica-de-privacidad", "aviso-legal", "terminos", "condiciones", "cookies", "contacto", "sobre-nosotros", "quienes-somos", "ayuda", "preguntas-frecuentes"],
    history: ["anteriormente", "anterior", "antiguo", "el año pasado", "historia", "era"],
    challenge: ["verifica que eres humano", "comprobación de seguridad", "acceso denegado"],
  },
  it: {
    cliches: ["nel mondo di oggi", "nel mondo odierno", "al giorno d'oggi", "è importante notare", "è importante sottolineare", "in conclusione", "immergiamoci", "un ruolo cruciale", "una guida completa", "in continua evoluzione", "senza soluzione di continuità"],
    abbr: ["sig", "sigg", "dott", "dr", "prof", "ing", "avv", "ecc", "es", "pag", "n", "no", "vol", "cap", "ca"],
    notFound: ["pagina non trovata", "la pagina che cerchi", "la pagina non esiste", "non è più disponibile"],
    utility: ["privacy", "cookie", "note-legali", "termini", "condizioni", "contatti", "chi-siamo", "aiuto", "domande-frequenti"],
    history: ["precedentemente", "precedente", "ex", "l'anno scorso", "storia", "era"],
    challenge: ["verifica di essere umano", "controllo di sicurezza", "accesso negato"],
  },
  pt: {
    cliches: ["no mundo de hoje", "no mundo atual", "nos dias de hoje", "hoje em dia", "é importante notar", "é importante destacar", "em conclusão", "mergulhe em", "vamos mergulhar", "um papel crucial", "um guia completo", "em constante evolução", "sem complicações"],
    abbr: ["sr", "sra", "dr", "dra", "prof", "etc", "ex", "pág", "nº", "no", "av", "aprox", "vol", "cap"],
    notFound: ["página não encontrada", "página não existe", "a página que você procura", "a página que procura", "não está mais disponível"],
    utility: ["privacidade", "politica-de-privacidade", "termos", "cookies", "contato", "contacto", "sobre", "quem-somos", "ajuda", "perguntas-frequentes"],
    history: ["anteriormente", "anterior", "antigo", "ano passado", "história", "era"],
    challenge: ["verifique se você é humano", "verificação de segurança", "acesso negado"],
  },
  nl: {
    cliches: ["in de huidige snelle", "in de wereld van vandaag", "tegenwoordig", "het is belangrijk om op te merken", "concluderend", "tot slot", "laten we duiken in", "een cruciale rol", "een uitgebreide gids", "voortdurend evoluerende", "naadloos"],
    abbr: ["bijv", "bv", "o.a", "d.w.z", "dhr", "mevr", "dr", "prof", "nr", "ca", "enz", "m.b.t", "t.a.v", "z.g.a.n"],
    notFound: ["pagina niet gevonden", "deze pagina bestaat niet", "de pagina die je zoekt", "niet meer beschikbaar"],
    utility: ["privacy", "cookies", "voorwaarden", "algemene-voorwaarden", "contact", "over-ons", "colofon", "help", "veelgestelde-vragen"],
    history: ["voorheen", "vorige", "voormalig", "vorig jaar", "geschiedenis", "was"],
    challenge: ["bevestig dat je een mens bent", "beveiligingscontrole", "toegang geweigerd"],
  },
  pl: {
    cliches: ["w dzisiejszym szybko zmieniającym się", "w dzisiejszym świecie", "w dzisiejszych czasach", "warto zauważyć", "należy pamiętać", "podsumowując", "zanurzmy się", "kluczową rolę", "kompleksowy przewodnik", "stale ewoluującym", "bezproblemowo"],
    abbr: ["np", "tzn", "tj", "itd", "itp", "dr", "prof", "inż", "mgr", "ul", "nr", "godz", "r", "w", "ok", "tzw", "m.in", "zł", "str"],
    notFound: ["nie znaleziono strony", "strona nie została znaleziona", "strona nie istnieje", "nie jest już dostępna"],
    utility: ["polityka-prywatnosci", "prywatnosc", "cookies", "regulamin", "kontakt", "o-nas", "pomoc", "czesto-zadawane-pytania"],
    history: ["wcześniej", "poprzedni", "dawny", "w zeszłym roku", "historia", "był", "była"],
    challenge: ["potwierdź, że jesteś człowiekiem", "weryfikacja bezpieczeństwa", "odmowa dostępu"],
  },
  ru: {
    cliches: ["в современном мире", "в наше время", "в сегодняшнем быстро меняющемся", "важно отметить", "стоит отметить", "в заключение", "подводя итог", "давайте погрузимся", "ключевую роль", "исчерпывающее руководство", "постоянно развивающемся", "бесшовн"],
    abbr: ["т.е", "т.д", "т.п", "др", "пр", "см", "г", "гг", "в", "вв", "ул", "д", "стр", "рис", "тыс", "млн", "млрд", "руб", "проф", "им"],
    notFound: ["страница не найдена", "такой страницы нет", "страница не существует", "больше недоступна"],
    utility: ["politika-konfidencialnosti", "konfidencialnost", "privacy", "kontakty", "o-nas", "o-kompanii", "pomoshch", "faq", "oferta"],
    history: ["ранее", "прежний", "бывший", "в прошлом году", "история", "был", "была"],
    challenge: ["подтвердите, что вы не робот", "проверка безопасности", "доступ запрещён", "доступ запрещен"],
  },
};

export const LANGS = Object.keys(PACKS);

/** "pt-BR" → "pt"; unknown or empty → null. */
export function base(lang) {
  const b = String(lang ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return b || null;
}

/** The pack for a page language, or null when the language is unknown / not packed. */
export const pack = (lang) => PACKS[base(lang)] ?? null;

/** Packs that apply to a page: its own language, or every pack when the language is unknown. */
export const packsFor = (lang) => (pack(lang) ? [pack(lang)] : Object.values(PACKS));

/** Lower-case with the page's language rules (Turkish/Azerbaijani dotted/dotless i only for those languages). */
export function lower(s, lang) {
  const b = base(lang);
  try {
    return String(s ?? "").toLocaleLowerCase(b ?? "en");
  } catch {
    return String(s ?? "").toLowerCase();
  }
}

/** Lower-case a string for comparison only, so "İstanbul" / "istanbul" and "IT" / "it" both match. */
export function fold(s) {
  return String(s ?? "").toLocaleLowerCase("tr").replace(/ı/g, "i").normalize("NFC");
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const all = (key) => [...new Set(Object.values(PACKS).flatMap((p) => p[key]))];

/**
 * One regex over every pack's words/phrases, for text passed through fold(). Each entry starts at a word start;
 * entries of up to 4 letters must also end at a word end ("was", "idi", "era" — not "wash", "idil", "eras"),
 * longer ones may continue ("geçmiş" also matches "geçmişte").
 */
export function anyPhrase(key) {
  const parts = all(key).map((w) => {
    const f = esc(fold(w));
    return [...w].length <= 4 ? `(?<![\\p{L}\\p{N}])${f}(?![\\p{L}\\p{N}])` : `(?<![\\p{L}\\p{N}])${f}`;
  });
  return new RegExp(parts.join("|"), "u");
}

/** Legal/contact/help slugs as one path regex ("/privacy-policy", "/impressum", "/hakkimizda"). */
export const UTILITY_PATH = new RegExp(`/(${all("utility").map(esc).join("|")})`, "i");

// Scripts that do not separate words with spaces: count words with Intl.Segmenter.
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
let wordSeg = null;

/** Words of a text: whitespace-separated tokens with a letter or digit; dictionary segmentation for CJK/Thai. */
export function words(s) {
  s = String(s ?? "");
  if (UNSPACED.test(s) && typeof Intl.Segmenter === "function") {
    wordSeg ??= new Intl.Segmenter(undefined, { granularity: "word" });
    return [...wordSeg.segment(s)].filter((x) => x.isWordLike).map((x) => x.segment);
  }
  return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}
