import { useState } from "react";
import type { ReactNode } from "react";

/**
 * AEO Readiness Auditor — Single-file React app (TypeScript)
 * - Paste this into src/AEOAuditorApp.tsx
 * - Requires Tailwind (or replace classNames with your CSS)
 */

const FAQ_API_URL = import.meta.env.VITE_FAQ_API_URL as string | undefined;

/* --------------------------- Utility helpers --------------------------- */

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function safeJsonParse<T = any>(txt: string): T | null {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function extractJSONLD(doc: Document): any[] {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  const blocks: any[] = [];
  for (const s of scripts) {
    const txt = s.textContent || "";
    const parsed =
      safeJsonParse<any>(txt) ??
      safeJsonParse<any>(txt.replaceAll("\n", " "));
    if (!parsed) continue;
    if (Array.isArray(parsed)) blocks.push(...parsed);
    else blocks.push(parsed);
  }
  return blocks;
}

function textContent(el?: Element | null) {
  return (el?.textContent || "").trim();
}

function words(str: string) {
  return (str || "").replace(/\n+/g, " ").split(/\s+/).filter(Boolean);
}

function countSyllables(word: string) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const m = w.match(/[aeiouy]{1,2}/g);
  let s = m ? m.length : 0;
  if (w.endsWith("e")) s = Math.max(1, s - 1);
  return Math.max(1, s);
}

function fleschReadingEase(text: string) {
  const sents = text.split(/[.!?]+\s/).filter(Boolean);
  const ws = words(text);
  const syllables = ws.reduce((sum, w) => sum + countSyllables(w), 0);
  const sentences = Math.max(1, sents.length);
  const wordsCount = Math.max(1, ws.length);
  const score = 206.835 - 1.015 * (wordsCount / sentences) - 84.6 * (syllables / wordsCount);
  return clamp(score, -50, 120);
}

function unique<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

/* ---------- FAQ / heading helpers (smarter + product/brand focus) ----- */

function looksLikeQuestion(s: string) {
  const t = s.trim();
  return /^(what|why|how|when|where|who|which|can|do|does|is|are|should|could|will|won't|can't|may)\b/i.test(t) || t.endsWith("?");
}

/** Headings we *don't* want as FAQs: nav / UI / generic marketing blocks */
const CTA_HEADING_PATTERNS: RegExp[] = [
  /customer reviews?/i,
  /reviews?/i,
  /recently viewed/i,
  /you may also like/i,
  /related products?/i,
  /support/i,
  /help/i,
  /explore/i,
  /about us/i,
  /contact us/i,
  /my account/i,
  /login/i,
  /sign in/i,
  /basket/i,
  /cart/i,
  /wishlist/i,
  /newsletter/i,
  /follow us/i,
  /social/i,
  /shop now/i,
  /view all/i,
  /special offer/i,
  /limited time offer/i,
  /see more/i,
  /prospera home/i,
];

function isMarketingCTAHeading(h: string) {
  const t = h.trim();
  if (t.length < 5) return true; // too short to be meaningful
  return CTA_HEADING_PATTERNS.some((re) => re.test(t));
}

/** Turn a heading into a more natural, product/brand/category style question */
function headingToQuestion(raw: string) {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return "";

  // Already a question? Just normalize
  if (looksLikeQuestion(t)) return t.endsWith("?") ? t : t + "?";

  const base = t.replace(/[.?!]+$/, "");

  // Offers / promos
  if (/^get\b/i.test(base)) {
    return `How can I ${base.replace(/^get\b/i, "").trim()}?`;
  }
  if (/offer/i.test(base)) {
    return `What offer is available for ${base.replace(/offer/i, "").trim()}?`;
  }
  if (/\bfree\b/i.test(base)) {
    return `What free gifts or bonuses are included with ${base}?`;
  }

  // Product / category focus
  if (/\b(product|bundle|kit|plan|subscription|tester|analyser|manifold|set)\b/i.test(base)) {
    return `What should I know about the ${base}?`;
  }

  // Brand or collection focus
  if (/\bcollection\b/i.test(base)) {
    return `What is included in the ${base} collection?`;
  }

  // Generic fallback
  return `What should I know about ${base}?`;
}

function absoluteUrl(base: string, href: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/** Accept bare domains like "example.com" or "www.example.com" by auto-prepending https:// */
function normalizeUrl(input: string) {
  const raw = (input || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

/** Build a fetch URL given a proxy base and a page URL.
 * Supports:
 *  - "" (no proxy) -> direct fetch
 *  - "https://r.jina.ai/" + "https://example.com"
 *  - "http://localhost:8787/fetch?url=" + encodeURIComponent(page)
 *  - "http://localhost:8787/fetch?url={url}" with placeholder
 */
function buildFetchUrl(proxy: string, pageUrl: string) {
  const trimmed = (proxy || "").trim();
  if (!trimmed) return pageUrl;

  // placeholder form e.g. "http://localhost:8787/fetch?url={url}"
  if (trimmed.includes("{url}")) {
    return trimmed.replace("{url}", encodeURIComponent(pageUrl));
  }

  // query-style proxy, e.g. "http://localhost:8787/fetch?url="
  if (trimmed.includes("?")) {
    return `${trimmed}${encodeURIComponent(pageUrl)}`;
  }

  // path-style proxy (Jina AI etc.)
  return trimmed.endsWith("/") ? trimmed + pageUrl : `${trimmed}/${pageUrl}`;
}

/* ------------------------------- Types -------------------------------- */

export type SubscoreKey =
  | "ContentClarity"
  | "StructuredData"
  | "Readability"
  | "TechnicalSEO"
  | "EATTrust"
  | "MediaAlt"
  | "InternalLinks";

export type Report = {
  url: string;
  title?: string;
  description?: string;
  lang?: string | null;
  wordCount: number;
  readingEase: number;
  hasViewport: boolean;
  hasCanonical: boolean;
  hasOG: boolean;
  h1: string | null;
  h2s: string[];
  jsonldTypes: string[];
  faqsDetected: boolean;
  howToDetected: boolean;
  articleDetected: boolean;
  breadcrumbDetected: boolean;
  authorDetected: boolean;
  updatedDetected: boolean;
  qaHeadings: string[];
  images: { total: number; withAlt: number };
  internalLinks: number;
  externalLinks: number;
  subscores: Record<SubscoreKey, number>;
  subscoreReasons: Record<SubscoreKey, string[]>; //explanation on AEO Scores
  totalScore: number;
  suggestions: string[];
  suggestedFAQs: { question: string; answer: string }[];
  faqJsonLD: string;
  notes: string[];
  bodyPreview: string; // trimmed body text for LLM prompts
  /** Heuristic: looks like reader-mode / sanitized HTML */
  isSanitized?: boolean;
  sanitizedReasons?: string[];
};

/* ------------------------------ Component ----------------------------- */

type Mode = "html" | "fetch";

export default function AEOAuditorApp() {
  const [url, setUrl] = useState("");
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [corsProxy, setCorsProxy] = useState<string>("https://r.jina.ai/");
  const [mode, setMode] = useState<Mode>("fetch");

  const normalizedUrl = normalizeUrl(url);
  const canAnalyze =
    mode === "html"
      ? html.trim().length > 0
      : !!normalizedUrl || html.trim().length > 0;

  async function handleFetch() {
    setError(null);
    setLoading(true);
    setReport(null);
    try {
      const base = normalizedUrl;

      if (mode === "html") {
        if (!html.trim()) {
          throw new Error("Please paste raw HTML to analyze.");
        }
        const rep = analyzeDocument(html, base || "");
        setReport(rep);
      } else {
        // fetch mode: try URL (optionally via proxy), fall back to HTML if present
        if (html.trim() && !base) {
          const rep = analyzeDocument(html, "");
          setReport(rep);
        } else if (base) {
          const fetchUrl = buildFetchUrl(corsProxy, base);
          const res = await fetch(fetchUrl);
          if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
          const txt = await res.text();
          const rep = analyzeDocument(txt, base);
          setReport(rep);
        } else {
          throw new Error("Enter a URL or switch to 'Paste raw HTML' mode.");
        }
      }
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-4">
          <h1 className="text-3xl font-bold tracking-tight">AEO Readiness Auditor</h1>
          <p className="text-sm text-slate-600 mt-1">
            Analyze a page for Answer / Generative Engine Optimization and get a score + actionable recommendations.
          </p>
        </header>

        {/* Mode toggle */}
        <section className="mb-4 flex flex-col gap-2">
          <div className="inline-flex rounded-full bg-slate-100 p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("html")}
              className={
                "px-3 py-1 rounded-full font-medium transition " +
                (mode === "html"
                  ? "bg-white shadow text-slate-900"
                  : "text-slate-600 hover:text-slate-900")
              }
            >
              Paste raw HTML (most accurate)
            </button>
            <button
              type="button"
              onClick={() => setMode("fetch")}
              className={
                "px-3 py-1 rounded-full font-medium transition " +
                (mode === "fetch"
                  ? "bg-white shadow text-slate-900"
                  : "text-slate-600 hover:text-slate-900")
              }
            >
              Fetch via URL / proxy (may strip SEO tags)
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Raw HTML keeps all meta tags, JSON-LD, images, and navigation. Some proxies (like reader-mode scrapers)
            remove these, which can make Structured Data / Technical SEO / E-E-A-T scores look artificially low.
          </p>
        </section>

        <section className="mb-4 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2 bg-white rounded-2xl shadow p-4">
            <label className="text-sm font-medium flex items-center justify-between">
              <span>Page URL</span>
              {mode === "fetch" && (
                <span className="text-[10px] uppercase tracking-wide text-slate-500">
                  Fetch mode active
                </span>
              )}
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 p-3 focus:outline-none focus:ring-2 focus:ring-slate-300"
              placeholder="https://example.com/your-page (or bare: example.com)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="text"
            />
            <div className="mt-3 text-xs text-slate-500">
              Tip: For full HTML, point this at a local proxy like{" "}
              <span className="font-mono">http://localhost:8787/fetch?url=</span> (or use{" "}
              <span className="font-mono">{`...?url={url}`}</span>).
            </div>
            <div className="mt-3">
              <label className="text-xs font-medium">CORS / HTML proxy (optional)</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-xs"
                placeholder="https://r.jina.ai/  or  http://localhost:8787/fetch?url="
                value={corsProxy}
                onChange={(e) => setCorsProxy(e.target.value)}
              />
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <label className="text-sm font-medium flex items-center justify-between">
              <span>Or paste HTML</span>
              {mode === "html" && (
                <span className="text-[10px] uppercase tracking-wide text-slate-500">
                  Raw HTML mode active
                </span>
              )}
            </label>
            <textarea
              className="mt-1 w-full rounded-xl border border-slate-200 p-3 h-32 text-xs font-mono"
              placeholder="<!doctype html>..."
              value={html}
              onChange={(e) => setHtml(e.target.value)}
            />
          </div>
        </section>

        <div className="flex gap-3 mb-6">
          <button
            onClick={handleFetch}
            disabled={!canAnalyze || loading}
            className="rounded-xl bg-slate-900 text-white px-5 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Analyzing…" : "Analyze Page"}
          </button>
          {report && (
            <button
              onClick={() => copy(JSON.stringify(report, null, 2))}
              className="rounded-xl bg-white border border-slate-200 px-4 py-3 hover:bg-slate-50"
            >
              Copy JSON Report
            </button>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-xl bg-red-50 text-red-800 border border-red-200 p-4">
            {error}
          </div>
        )}

        {report ? (
          <>
            {report.isSanitized && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 p-4 text-sm">
                <div className="font-semibold mb-1">
                  Heads up: this looks like reader-mode / sanitized HTML
                </div>
                <p className="mb-2">
                  This HTML is missing many SEO signals (meta tags, JSON-LD, images, navigation). Scores for
                  Structured Data, Technical SEO, E-E-A-T, and Media may be artificially low.
                </p>
                {report.sanitizedReasons && report.sanitizedReasons.length > 0 && (
                  <ul className="list-disc pl-5 space-y-1">
                    {report.sanitizedReasons.slice(0, 4).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs">
                  Tip: Switch to <span className="font-semibold">“Paste raw HTML (most accurate)”</span> or use a
                  non-stripping proxy that returns the original HTML.
                </p>
              </div>
            )}

            <main className="grid gap-6 md:grid-cols-3">
              <div className="md:col-span-2 grid gap-6">
                <ScoreCard report={report} />
                <SignalsCard report={report} />
                <RecommendationsCard report={report} />
              </div>
              <aside className="grid gap-6">
                <FAQSuggestionsCard report={report} onCopy={copy} />
                <JSONLDCard report={report} onCopy={copy} />
                <MetaCard report={report} />
              </aside>
            </main>
          </>
        ) : (
          <div className="mt-8 text-sm text-slate-600">
            Enter a URL (or paste HTML) and click Analyze. You'll get a readiness score out of 100, with per-signal
            breakdowns and copy-ready FAQ JSON-LD.
          </div>
        )}

        <footer className="mt-16 text-xs text-slate-500">
          AEO Readiness Auditor • Heuristic-based. Use alongside human judgment and testing.
        </footer>
      </div>
    </div>
  );
}

/* ---------------------- Sanitization / proxy check -------------------- */

function detectSanitizedHTML(doc: Document, bodyText: string) {
  const reasons: string[] = [];

  const hasTitle = !!doc.querySelector("title");
  const hasMetaDesc = !!doc.querySelector('meta[name="description"]');
  const hasCanonical = !!doc.querySelector('link[rel="canonical"]');
  const hasOG = !!doc.querySelector('meta[property^="og:"]');
  const jsonLdCount = doc.querySelectorAll('script[type="application/ld+json"]').length;
  const imgCount = doc.querySelectorAll("img").length;
  const navCount = doc.querySelectorAll("nav, header").length;
  const headChildren = doc.head ? doc.head.children.length : 0;

  if (!hasTitle) reasons.push("No <title> tag found.");
  if (!hasMetaDesc) reasons.push("No meta description tag found.");
  if (!hasCanonical) reasons.push("No canonical <link> found.");
  if (!hasOG) reasons.push("No Open Graph meta tags found.");
  if (jsonLdCount === 0) reasons.push("No JSON-LD structured data blocks found.");
  if (imgCount === 0) reasons.push("No <img> tags found (images removed?).");
  if (navCount === 0) reasons.push("No <nav> or <header> elements found (navigation stripped?).");
  if (headChildren === 0) reasons.push("<head> is almost empty, suggesting sanitized HTML.");

  const bodyLen = (bodyText || "").trim().length;
  if (bodyLen > 800 && reasons.length >= 4) {
    reasons.push("Long article text but very few SEO tags, typical of reader-mode / cleaned HTML.");
  }

  const isSanitized = bodyLen > 200 && reasons.length >= 4;
  return { isSanitized, reasons };
}

/* ------------------------------- Analyzer ------------------------------ */

function analyzeDocument(html: string, baseUrl: string): Report {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const get = (sel: string) => doc.querySelector(sel);

  const title = textContent(get("title"));
  const description = get('meta[name="description"]')?.getAttribute("content") || undefined;
  const lang = doc.documentElement.getAttribute("lang");
  const hasViewport = !!get('meta[name="viewport"]');
  const hasCanonical = !!get('link[rel="canonical"]');
  const hasOG = !!get('meta[property^="og:"]');
  const h1 = textContent(get("h1")) || null;
  const h2s = Array.from(doc.querySelectorAll("h2,h3")).map((h) => textContent(h)).filter(Boolean);
  const bodyText = textContent(get("body"));
  const wordCount = words(bodyText).length;
  const readingEase = fleschReadingEase(bodyText);

  // keep a trimmed preview for LLM prompts (avoid sending whole HTML)
  const bodyPreview = bodyText.slice(0, 4000);

  // Sanitization check (reader-mode / proxy-cleaned HTML)
  const { isSanitized, reasons: sanitizedReasons } = detectSanitizedHTML(doc, bodyText);

  // Links
  const anchors = Array.from(doc.querySelectorAll("a[href]")) as HTMLAnchorElement[];
  let internalLinks = 0;
  let externalLinks = 0;
  for (const a of anchors) {
    const href = a.getAttribute("href") || "";
    const abs = absoluteUrl(baseUrl, href);
    try {
      const bu = new URL(baseUrl);
      const au = new URL(abs);
      if (bu.host === au.host) internalLinks++;
      else externalLinks++;
    } catch {
      // ignore
    }
  }

  // Images
  const imgs = Array.from(doc.querySelectorAll("img"));
  const withAlt = imgs.filter((i) => (i.getAttribute("alt") || "").trim().length > 0).length;

  // JSON-LD
  const jsonldBlocks = extractJSONLD(doc);
  const jsonldTypes = unique(
    jsonldBlocks
      .flatMap((b) => {
        if (b && typeof b === "object") {
          const t = (b as any)["@type"];
          if (!t) return [] as string[];
          return Array.isArray(t) ? t : [t];
        }
        return [] as string[];
      })
      .map(String)
  );

  const faqsDetected = jsonldTypes.includes("FAQPage") || !!doc.querySelector("section#faq, .faq, [itemtype*='FAQPage']");
  const howToDetected = jsonldTypes.includes("HowTo") || !!doc.querySelector("[itemtype*='HowTo']");
  const articleDetected = jsonldTypes.includes("Article") || !!doc.querySelector("[itemtype*='Article']");
  const breadcrumbDetected =
    jsonldTypes.includes("BreadcrumbList") || !!doc.querySelector("nav.breadcrumb, [itemtype*='BreadcrumbList']");
  const authorDetected =
    /author|byline/i.test(doc.body.innerHTML) || jsonldTypes.includes("Person") || jsonldTypes.includes("Organization");
  const updatedDetected =
    /updated|last\s+updated|modified/i.test(doc.body.textContent || "") || !!doc.querySelector("time[datetime]");

  // FAQ heading candidates (skip nav / CTA)
  const faqHeadingCandidates = unique(
    h2s
      .map((h) => h.trim())
      .filter(Boolean)
      .filter((h) => !isMarketingCTAHeading(h))
  );

  const qaHeadings = faqHeadingCandidates.filter(looksLikeQuestion);

  // Suggested FAQs (heuristic fallback)
  const suggestedFaqs = faqHeadingCandidates.slice(0, 8).map((h) => ({
    question: headingToQuestion(h),
    answer: "Add a concise, 1–3 sentence answer in plain language. Include a key fact or step.",
  }));

  // Subscores
  const subs: Record<SubscoreKey, number> = {
    ContentClarity: 0,
    StructuredData: 0,
    Readability: 0,
    TechnicalSEO: 0,
    EATTrust: 0,
    MediaAlt: 0,
    InternalLinks: 0,
  };

    // 👇 new: human-readable explanations for why each score is what it is
  const subscoreReasons: Record<SubscoreKey, string[]> = {
    ContentClarity: [],
    StructuredData: [],
    Readability: [],
    TechnicalSEO: [],
    EATTrust: [],
    MediaAlt: [],
    InternalLinks: [],
  };

  // Content clarity
  let cc = 0;
  if (h1) {
    cc += 25;
  } else {
    subscoreReasons.ContentClarity.push(
      "No H1 found — answer engines lose a clear primary topic signal (worth up to 25 points)."
    );
  }

  if (title && title.length >= 15 && title.length <= 65) {
    cc += 25;
  } else {
    subscoreReasons.ContentClarity.push(
      "Title is missing or outside the 15–65 character range, which reduces how well AI can summarize this page."
    );
  }

  if (description && description.length >= 80 && description.length <= 170) {
    cc += 20;
  } else {
    subscoreReasons.ContentClarity.push(
      "Meta description is missing or not in the 80–170 character window, so answer engines have a weaker summary."
    );
  }

  if (wordCount >= 400) {
    cc += 20;
  } else {
    cc += Math.min(20, (wordCount / 400) * 20);
    subscoreReasons.ContentClarity.push(
      `Content depth is low (${wordCount} words) — long-form pages (400–1200+ words) are easier for AEO to mine for answers.`
    );
  }

  if (qaHeadings.length > 0) {
    cc += 10;
  } else {
    subscoreReasons.ContentClarity.push(
      "No question-style subheadings detected; converting key H2/H3s into “What / How / Why…” questions improves AEO."
    );
  }

  subs.ContentClarity = clamp(cc);


  // Structured data
  let sd = 0;
  if (faqsDetected) {
    sd += 35;
  } else {
    subscoreReasons.StructuredData.push(
      "No FAQ schema detected — FAQPage JSON-LD helps answer engines extract direct Q&A."
    );
  }

  if (howToDetected) {
    sd += 15;
  } else if (/\b(steps|guide|setup|install|configure)\b/i.test(bodyText)) {
    subscoreReasons.StructuredData.push(
      "Page looks like a guide/steps but has no HowTo schema — mark it up so AI can understand the steps."
    );
  }

  if (articleDetected) {
    sd += 15;
  } else {
    subscoreReasons.StructuredData.push(
      "No Article schema detected — adding it clarifies the main entity, headline, and author for AEO."
    );
  }

  if (breadcrumbDetected) {
    sd += 15;
  } else {
    subscoreReasons.StructuredData.push(
      "No BreadcrumbList schema — this reduces how well answer engines understand site hierarchy."
    );
  }

  if (authorDetected) {
    sd += 20;
  } else {
    subscoreReasons.StructuredData.push(
      "No clear author/organization schema — answer engines rely on this for E-E-A-T and citation."
    );
  }

  subs.StructuredData = clamp(sd);


  // Readability
  // Readability
  let r = 0;
  if (readingEase >= 60 && readingEase <= 80) {
    r = 85;
  } else if (readingEase > 80) {
    r = 95;
  } else if (readingEase >= 45) {
    r = 65;
    subscoreReasons.Readability.push(
      `Reading ease score is ${Math.round(
        readingEase
      )} — content is somewhat dense; shorter sentences and simpler wording will help AEO extract answers.`
    );
  } else {
    r = 40;
    subscoreReasons.Readability.push(
      `Reading ease score is ${Math.round(
        readingEase
      )} — text is hard to read; simplify language and break up long paragraphs.`
    );
  }
  subs.Readability = clamp(r);


  // Technical SEO
  let ts = 0;
  if (lang) {
    ts += 20;
  } else {
    subscoreReasons.TechnicalSEO.push(
      "Missing <html lang> attribute — AEO systems need this to interpret language correctly."
    );
  }

  if (hasViewport) {
    ts += 25;
  } else {
    subscoreReasons.TechnicalSEO.push(
      "No responsive viewport meta tag — weak mobile friendliness can limit inclusion in AI answer surfaces."
    );
  }

  if (hasCanonical) {
    ts += 25;
  } else {
    subscoreReasons.TechnicalSEO.push(
      "No canonical URL — answer engines may be unsure which version of this page to treat as primary."
    );
  }

  if (hasOG) {
    ts += 15;
  } else {
    subscoreReasons.TechnicalSEO.push(
      "Open Graph tags are missing — many AI experiences use them for title/description when rendering cards."
    );
  }

  if (updatedDetected) {
    ts += 15;
  } else {
    subscoreReasons.TechnicalSEO.push(
      "No clear “last updated” signal — fresher pages are preferred for AI-generated answers."
    );
  }

  subs.TechnicalSEO = clamp(ts);


  // E-E-A-T / Trust
  // E-E-A-T / Trust
  let eat = 0;
  const hasAbout = !!doc.querySelector("a[href*='about']");
  const hasContact = !!doc.querySelector("a[href*='contact']");
  const refs = anchors.filter((a) => /\b(source|reference|learn more)\b/i.test(textContent(a)));

  if (authorDetected) {
    eat += 35;
  } else {
    subscoreReasons.EATTrust.push(
      "No clear author/organization info — answer engines struggle to assess expertise and experience."
    );
  }

  if (hasAbout) {
    eat += 20;
  } else {
    subscoreReasons.EATTrust.push(
      "No About page link detected — brand identity and mission are important for trust."
    );
  }

  if (hasContact) {
    eat += 20;
  } else {
    subscoreReasons.EATTrust.push(
      "No Contact link detected — lack of visible contact routes lowers perceived trustworthiness."
    );
  }

  if (refs.length > 0) {
    eat += 25;
  } else {
    subscoreReasons.EATTrust.push(
      "No outbound reference/source links labeled as such — citing sources strengthens E-E-A-T."
    );
  }

  subs.EATTrust = clamp(eat);


  // Media Alt
  const mediaAlt = imgs.length ? (withAlt / imgs.length) * 100 : 100;
  subs.MediaAlt = clamp(mediaAlt);
  if (imgs.length > 0 && withAlt < imgs.length) {
    subscoreReasons.MediaAlt.push(
      `Only ${withAlt} of ${imgs.length} images have alt text — AI cannot fully understand your visuals.`
    );
  }


  // Internal links
  subs.InternalLinks = clamp(Math.min(100, (internalLinks / 8) * 100));
  if (internalLinks < 8) {
    subscoreReasons.InternalLinks.push(
      `Only ${internalLinks} internal links detected — AEO benefits from 8–12 contextual links to related pages.`
    );
  }


  // Weighted total
  const weights: Record<SubscoreKey, number> = {
    ContentClarity: 0.22,
    StructuredData: 0.24,
    Readability: 0.12,
    TechnicalSEO: 0.16,
    EATTrust: 0.14,
    MediaAlt: 0.06,
    InternalLinks: 0.06,
  };
  const total = Object.entries(weights).reduce(
    (sum, [k, w]) => sum + (subs[k as SubscoreKey] || 0) * w,
    0
  );

  const suggestions: string[] = [];
  if (!h1) suggestions.push("Add a clear, single H1 that states the page’s primary topic.");
  if (!title || title.length < 15 || title.length > 65)
    suggestions.push("Rewrite the <title> to 15–65 chars with a direct, answer-oriented promise.");
  if (!description || description.length < 80 || description.length > 170)
    suggestions.push("Provide a meta description (80–170 chars) summarizing the answer and value.");
  if (wordCount < 400)
    suggestions.push("Increase content depth to 600–1,200 words focused on user questions and intents.");
  if (!faqsDetected) suggestions.push("Add FAQPage JSON-LD with 4–8 concise Q&As that mirror real queries.");
  if (!howToDetected && /\b(steps|guide|setup|install|configure)\b/i.test(bodyText))
    suggestions.push("Mark up procedural content with HowTo schema.");
  if (!breadcrumbDetected) suggestions.push("Add BreadcrumbList schema for better context and sitelinks.");
  if (!authorDetected) suggestions.push("Expose author/org info (bio, credentials) and Organization/Person schema.");
  if (!hasCanonical) suggestions.push("Specify a canonical URL to consolidate signals.");
  if (!hasViewport) suggestions.push('Add a responsive <meta name="viewport"> for mobile rendering.');
  if (!hasOG) suggestions.push("Include basic Open Graph tags (og:title, og:description, og:type, og:url).");
  if (subs.MediaAlt < 90) suggestions.push("Write descriptive alt text for all informative images.");
  if (internalLinks < 8) suggestions.push("Add 8–12 contextual internal links to closely related pages.");
  if (!lang) suggestions.push('Set the <html lang> attribute (e.g., lang="en").');
  if (!updatedDetected) suggestions.push("Show a ‘Last updated’ timestamp near the top of the article.");
  if (qaHeadings.length === 0)
    suggestions.push("Convert key subheadings into question form (What, How, Why…) to align with answer engines.");

  const faqJsonLD = makeFAQJsonLD(suggestedFaqs);

  const notes: string[] = [];
  if (isSanitized) {
    notes.push(
      "This HTML appears to be stripped / reader-mode output (likely from a proxy). Meta tags, JSON-LD, navigation, and images may be missing—scores for Structured Data / Technical SEO / E-E-A-T / Media may be lower than reality. For accurate AEO scoring, use raw HTML or a non-stripping proxy."
    );
  }
  notes.push(
    "Scores are heuristic. Validate with live SERPs, AI-overviews, and conversation models.",
    "Include explicit answers in the first 1–2 paragraphs (‘answer-first’).",
    "Use plain language, short paragraphs, and bullet lists to improve scannability."
  );

  return {
    url: baseUrl,
    title,
    description,
    lang,
    hasViewport,
    hasCanonical,
    hasOG,
    h1,
    h2s,
    wordCount,
    readingEase,
    jsonldTypes,
    faqsDetected,
    howToDetected,
    articleDetected,
    breadcrumbDetected,
    authorDetected,
    updatedDetected,
    qaHeadings,
    images: { total: imgs.length, withAlt },
    internalLinks,
    externalLinks,
    subscores: subs,
    subscoreReasons,  
    totalScore: Math.round(total),
    suggestions,
    suggestedFAQs: suggestedFaqs,
    faqJsonLD,
    notes,
    bodyPreview,
    isSanitized,
    sanitizedReasons,
  };
}

function makeFAQJsonLD(qas: { question: string; answer: string }[]) {
  const obj = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qas.slice(0, 8).map((qa) => ({
      "@type": "Question",
      name: qa.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: qa.answer,
      },
    })),
  };
  return JSON.stringify(obj, null, 2);
}

/* --------------------------------- UI --------------------------------- */

function Card({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{Math.round(score)}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full mt-1 overflow-hidden">
        <div className="h-full bg-slate-900" style={{ width: `${clamp(score)}%` }} />
      </div>
    </div>
  );
}

function ScoreCard({ report }: { report: Report }) {
  return (
    <Card title="AEO Readiness Score" subtitle={report.url}>
      <div className="grid gap-6 md:grid-cols-3 items-center">
        <div className="md:col-span-1 flex items-center justify-center">
          <div className="relative h-40 w-40 rounded-full bg-slate-100 grid place-items-center">
            <div className="text-4xl font-bold">{report.totalScore}</div>
            <div className="text-xs text-slate-500 absolute bottom-3">/ 100</div>
          </div>
        </div>
        <div className="md:col-span-2 grid gap-3">
          <ScoreBar label="Content Clarity" score={report.subscores.ContentClarity} />
          <ScoreBar label="Structured Data" score={report.subscores.StructuredData} />
          <ScoreBar label="Readability" score={report.subscores.Readability} />
          <ScoreBar label="Technical SEO" score={report.subscores.TechnicalSEO} />
          <ScoreBar label="E-E-A-T / Trust" score={report.subscores.EATTrust} />
          <ScoreBar label="Media Alt Coverage" score={report.subscores.MediaAlt} />
          <ScoreBar label="Internal Links" score={report.subscores.InternalLinks} />
        </div>
      </div>
    </Card>
  );
}

function SignalsCard({ report }: { report: Report }) {
  const rows: [string, string | number | boolean][] = [
    ["Title", report.title || "—"],
    ["Meta Description", report.description || "—"],
    ["H1", report.h1 || "—"],
    ["Language (html lang)", report.lang || "—"],
    ["Word Count", report.wordCount],
    ["Reading Ease (Flesch)", Math.round(report.readingEase)],
    ["Viewport Meta", report.hasViewport ? "yes" : "no"],
    ["Canonical", report.hasCanonical ? "yes" : "no"],
    ["Open Graph", report.hasOG ? "yes" : "no"],
    ["Internal Links", report.internalLinks],
    ["External Links", report.externalLinks],
    ["Images (with alt / total)", `${report.images.withAlt}/${report.images.total}`],
    ["JSON-LD Types", report.jsonldTypes.join(", ") || "—"],
    ["FAQ Detected", report.faqsDetected ? "yes" : "no"],
    ["HowTo Detected", report.howToDetected ? "yes" : "no"],
    ["Article Detected", report.articleDetected ? "yes" : "no"],
    ["Breadcrumbs Detected", report.breadcrumbDetected ? "yes" : "no"],
    ["Author/Org Signals", report.authorDetected ? "yes" : "no"],
    ["Updated Signal", report.updatedDetected ? "yes" : "no"],
  ];
  return (
    <Card title="Signals & Checks" subtitle="What we found on the page">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-b last:border-0">
                <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">{k}</td>
                <td className="py-2">{String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report.qaHeadings.length > 0 && (
        <div className="mt-4">
          <div className="text-sm font-medium mb-1">Headings that already look like questions</div>
          <ul className="list-disc pl-6 text-sm text-slate-700">
            {report.qaHeadings.slice(0, 8).map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function RecommendationsCard({ report }: { report: Report }) {
  return (
    <Card title="Actionable Recommendations" subtitle="Prioritized list to improve AEO readiness">
      <ol className="list-decimal pl-6 text-sm space-y-2">
        {report.suggestions.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <div className="mt-4 text-xs text-slate-500">
        {report.notes.map((n, i) => (
          <div key={i}>• {n}</div>
        ))}
      </div>
    </Card>
  );
}

/* ------------------ FAQ card with optional LLM integration ------------ */
function FAQSuggestionsCard({
  report,
  onCopy,
}: {
  report: Report;
  onCopy: (t: string) => void;
}) {
  const [aiFaqs, setAiFaqs] = useState<{ question: string; answer: string }[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // ✅ Only show FAQs after AI has generated them
  const faqsToRender = aiFaqs && aiFaqs.length > 0 ? aiFaqs : [];

  async function handleGenerateAI() {
    if (!FAQ_API_URL) {
      setAiError("AI FAQ endpoint is not configured. Set VITE_FAQ_API_URL in your .env file.");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch(FAQ_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: report.url,
          title: report.title,
          h1: report.h1,
          description: report.description,
          headings: report.h2s,
          bodyPreview: report.bodyPreview,
        }),
      });
      if (!res.ok) throw new Error(`FAQ API error: ${res.status} ${res.statusText}`);
      const data = await res.json();
      if (!data || !Array.isArray(data.faqs)) {
        throw new Error("FAQ API returned unexpected format (expected { faqs: [{question, answer}] }).");
      }
      const cleaned = data.faqs
        .map((f: any) => ({
          question: String(f.question || "").trim(),
          answer: String(f.answer || "").trim(),
        }))
        .filter((f: any) => f.question.length > 0);
      setAiFaqs(cleaned);
    } catch (e: any) {
      setAiError(e?.message || "Failed to generate FAQs with AI.");
    } finally {
      setAiLoading(false);
    }
  }

  const faqJsonForCopy = faqsToRender.length > 0 ? makeFAQJsonLD(faqsToRender) : "";

  return (
    <Card title="FAQ Suggestions" subtitle="Generated by AI from this page">
      {faqsToRender.length > 0 ? (
        <ul className="list-disc pl-6 text-sm space-y-2">
          {faqsToRender.slice(0, 8).map((qa, i) => (
            <li key={i}>
              <span className="font-medium">Q:</span> {qa.question}
              <br />
              <span className="font-medium">A:</span> {qa.answer}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">
          No FAQs generated yet. Click <span className="font-semibold">Generate AI FAQs</span> to create
          product/brand/category-focused questions from this page.
        </p>
      )}

      {aiError && <p className="mt-2 text-xs text-red-600">{aiError}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => faqsToRender.length > 0 && onCopy(faqJsonForCopy)}
          className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"
          disabled={faqsToRender.length === 0}
        >
          Copy FAQ JSON
        </button>
        <button
          onClick={() => faqsToRender.length > 0 && onCopy(renderFAQMarkdown(faqsToRender))}
          className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm disabled:opacity-50"
          disabled={faqsToRender.length === 0}
        >
          Copy FAQ Markdown
        </button>
        <button
          onClick={handleGenerateAI}
          className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm disabled:opacity-50"
          disabled={aiLoading}
        >
          {aiLoading ? "Generating…" : "Generate AI FAQs"}
        </button>
      </div>

      {aiFaqs && aiFaqs.length > 0 && (
        <p className="mt-1 text-[11px] text-slate-500">
          FAQs above were generated by your LLM endpoint (VITE_FAQ_API_URL).
        </p>
      )}
    </Card>
  );
}



function renderFAQMarkdown(qas: { question: string; answer: string }[]) {
  return qas.map((qa) => `### ${qa.question}\n\n${qa.answer}\n`).join("\n");
}

function JSONLDCard({
  report,
  onCopy,
}: {
  report: Report;
  onCopy: (t: string) => void;
}) {
  return (
    <Card title="JSON-LD Preview" subtitle="Drop into your <head> or via GTM">
      <pre className="text-xs bg-slate-50 rounded-xl p-3 overflow-auto max-h-72">
        <code>{report.faqJsonLD}</code>
      </pre>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() =>
            onCopy(`<script type="application/ld+json">\n${report.faqJsonLD}\n<\/script>`)
          }
          className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm"
        >
          {/* literal text so JSX doesn't interpret a tag */}
          Copy with &lt;script&gt; tag
        </button>
        <button
          onClick={() => onCopy(report.faqJsonLD)}
          className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-sm"
        >
          Copy Raw JSON
        </button>
      </div>
    </Card>
  );
}

function MetaCard({ report }: { report: Report }) {
  return (
    <Card title="Meta Opportunities" subtitle="Quick copy suggestions">
      <div className="space-y-3 text-sm">
        <div>
          <div className="text-slate-500">Suggested Title (≤65 chars)</div>
          <div className="mt-1 p-2 bg-slate-50 rounded">{suggestTitle(report)}</div>
        </div>
        <div>
          <div className="text-slate-500">Suggested Meta Description (80–170 chars)</div>
          <div className="mt-1 p-2 bg-slate-50 rounded">{suggestDescription(report)}</div>
        </div>
      </div>
    </Card>
  );
}

function suggestTitle(r: Report) {
  const base = r.h1 || r.title || "Answer guide";
  const trimmed = base.replace(/\s+/g, " ").trim();
  const suffix = " (Guide)";
  const proposal = (trimmed + suffix).slice(0, 65);
  return proposal;
}

function suggestDescription(r: Report) {
  const base =
    r.description ||
    `Get concise answers to common questions about ${r.h1 || r.title || "this topic"}. Includes steps, FAQs, and expert tips.`;
  let s = base.replace(/\s+/g, " ").trim();
  if (s.length < 80) s = s + " Learn the essentials in minutes.";
  return s.slice(0, 170);
}
