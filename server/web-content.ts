// Owner-only website content overrides for the /test-site marketing pages.
// Each editable block is marked in the HTML with a comment pair:
//   <!--WEB:home:hero_title-->Default text here<!--/WEB-->
// On render, this module substitutes the inner content with any saved
// override from the site_settings table (key = "web:<page>:<blockKey>").
// Owners edit overrides via the Website section in the staff portal.
//
// Markdown-style accent: a *word* in the override is rendered as <em>word</em>
// so the gold-coloured italic accent in headlines remains editable as plain text.
//
// ── Field types ────────────────────────────────────────────────────────────
//   text / textarea   — inline body content. Output keeps the comment markers
//                       wrapping the value so future re-renders stay idempotent
//                       and the markers are visible to anyone inspecting source.
//   image             — CSS background-image fragment for use INSIDE a
//                       `style="<!--WEB:slug:hero_bg--><!--/WEB-->"` attribute.
//                       Empty = empty string (default page background shows).
//   image_html        — Renders an <img class="custom-logo"> tag. Used for the
//                       editable site logo. Empty = keep the default brand mark
//                       HTML (the wordmark stays in place when no logo uploaded).
//   image_url         — Bare URL (escaped for attribute context). For href/src
//                       attributes. Empty = falls back to captured default URL.
//   attr_text         — Plain text WITHOUT comment markers. Used inside
//                       <title>, <meta content="…">, anywhere comments would
//                       leak into a parsed value.
//   color             — Validated CSS hex colour (#abc / #aabbcc), no markers.
//                       Output is safe to inject inside a `<style>` block.
//                       Empty/invalid = falls back to captured default.
//   nav               — JSON-encoded list of nav links. Renders <a> tags with
//                       the active-class set based on the currently-rendering
//                       page slug. Empty/invalid = renders DEFAULT_NAV.
//   bar               — Announcement banner. Empty = empty string (banner
//                       hidden). Non-empty = wrapped <div class="announcement-bar">.
//
// Site-wide blocks: the special "site" pseudo-page is applied across EVERY
// rendered marketing page (used for phone, email, address, hours, footer copy,
// logo, theme colours, nav menu, announcement bar etc.).

import { storage } from "./storage";

export type WebFieldType =
  | "text"
  | "textarea"
  | "image"
  | "image_html"
  | "image_url"
  | "attr_text"
  | "color"
  | "nav"
  | "bar"
  | "gallery";

export interface WebBlockDef {
  key: string;
  label: string;
  type: WebFieldType;
  hint?: string;
}

export interface WebPageDef {
  slug: string;
  label: string;
  blocks: WebBlockDef[];
}

export interface NavLinkDef {
  label: string;
  href: string;
  /** Stable identifier used to set the active class for the current page. */
  slug: string;
  /** Visual style: "default" plain link, "order" pill, "cta" gold button. */
  style: "default" | "order" | "cta";
  hidden?: boolean;
}

const HERO_BG_HINT =
  "Recommended size: 1920×1080 landscape. Upload a photo of your venue, or paste an image URL. A dark overlay is added automatically so headline text stays legible.";

const META_TITLE_HINT =
  "Shown in the browser tab and on Google search results. Aim for ~60 characters.";
const META_DESC_HINT =
  "Used by Google and shown when the page is shared on WhatsApp, Facebook etc. Aim for 140–160 characters.";

// Per-page hero + meta blocks shared across all marketing pages.
const pageBlocks = (titleHint?: string): WebBlockDef[] => [
  { key: "meta_title", label: "Browser tab title", type: "attr_text", hint: META_TITLE_HINT },
  { key: "meta_description", label: "Search / share description", type: "attr_text", hint: META_DESC_HINT },
  { key: "hero_eyebrow", label: "Hero · small label", type: "text" },
  {
    key: "hero_title",
    label: "Hero · headline",
    type: "text",
    hint: titleHint ?? "Use *word* to highlight a word in gold italic.",
  },
  { key: "hero_sub", label: "Hero · subtitle", type: "textarea" },
  { key: "hero_bg", label: "Hero · background image", type: "image", hint: HERO_BG_HINT },
];

// Helper for body sections following the eyebrow / title / lead / image pattern.
// Used across all 8 marketing pages so the editor groups related fields.
const sectionBlocks = (
  prefix: string,
  sectionLabel: string,
  opts: { lead?: boolean; image?: boolean } = { lead: true, image: false },
): WebBlockDef[] => {
  const out: WebBlockDef[] = [
    { key: `${prefix}_eyebrow`, label: `${sectionLabel} · small label`, type: "text" },
    { key: `${prefix}_title`, label: `${sectionLabel} · heading`, type: "text" },
  ];
  if (opts.lead !== false) {
    out.push({ key: `${prefix}_lead`, label: `${sectionLabel} · intro paragraph`, type: "textarea" });
  }
  if (opts.image) {
    out.push({
      key: `${prefix}_image`,
      label: `${sectionLabel} · photo`,
      type: "image_url",
      hint: "Upload a square or landscape photo to replace the placeholder.",
    });
  }
  return out;
};

// Default navigation seed — used when no override is saved AND served back to
// the editor as the starting list of links the owner can rename / hide / reorder.
export const DEFAULT_NAV: NavLinkDef[] = [
  { label: "Home", href: "/test-site", slug: "home", style: "default" },
  { label: "Snooker", href: "/test-site/snooker", slug: "snooker", style: "default" },
  { label: "Dining", href: "/test-site/dining", slug: "dining", style: "default" },
  { label: "Events", href: "/test-site/events", slug: "events", style: "default" },
  { label: "Function Rooms", href: "/test-site/function-rooms", slug: "function-rooms", style: "default" },
  { label: "Gift Cards", href: "/test-site/gift-cards", slug: "gift-cards", style: "default" },
  { label: "Contact", href: "/test-site/contact", slug: "contact", style: "default" },
  { label: "Order", href: "/test-site/order", slug: "order", style: "order" },
  { label: "Book a Table", href: "/test-site/book", slug: "book", style: "cta" },
];

// Single source of truth for editable blocks. Add new entries here and
// place matching <!--WEB:slug:key-->...<!--/WEB--> markers in the HTML.
export const WEB_PAGES: WebPageDef[] = [
  {
    slug: "site",
    label: "Site-wide",
    blocks: [
      { key: "logo", label: "Logo image", type: "image_html", hint: "Upload your logo (PNG with transparent background works best). Replaces the wordmark in the nav and footer everywhere on the site. Leave blank to keep the default '147' wordmark." },
      { key: "color_blue", label: "Brand colour · primary blue", type: "color", hint: "Used for buttons, headings and accents. Default: #1E5BC6" },
      { key: "color_gold", label: "Brand colour · accent gold", type: "color", hint: "Used for highlights, the CTA button and hero accents. Default: #D9A93C" },
      { key: "announcement_text", label: "Announcement banner", type: "bar", hint: "Shows a banner at the top of every page (e.g. 'Closed Christmas Day' or 'New menu launching Friday'). Leave blank to hide the banner." },
      { key: "nav_links", label: "Navigation menu", type: "nav", hint: "Rename, reorder or hide links in the top navigation. The links themselves stay pointed at the right pages — you control how they appear." },
      { key: "phone", label: "Phone number", type: "text", hint: "Shown in the header info-bar (home), in the contact page, and in every page footer." },
      { key: "email", label: "Email address", type: "text", hint: "Shown on the contact page and in every page footer." },
      { key: "address_line1", label: "Address · line 1", type: "text", hint: "e.g. 147 Example Street" },
      { key: "address_line2", label: "Address · line 2", type: "text", hint: "e.g. Bradford, BD1 1AA" },
      { key: "address_region", label: "Address · region", type: "text", hint: "Shown on the contact page only — e.g. West Yorkshire" },
      { key: "hours_today", label: "Today's opening hours (info-bar)", type: "text", hint: "Shown on the home page info-bar — e.g. 12pm – 12am" },
      { key: "hours_mon_thu", label: "Hours · Monday – Thursday", type: "text" },
      { key: "hours_fri_sat", label: "Hours · Friday – Saturday", type: "text" },
      { key: "hours_sun", label: "Hours · Sunday", type: "text" },
      { key: "footer_tagline", label: "Footer tagline", type: "textarea", hint: "Short blurb in the footer under the brand mark." },
    ],
  },
  {
    slug: "home",
    label: "Home",
    blocks: [
      ...pageBlocks(),
      ...sectionBlocks("s1", "Section 1 — Why The 147"),
      ...sectionBlocks("s2", "Section 2 — Our Tables"),
      { key: "s3_lead", label: "Membership teaser · intro paragraph", type: "textarea" },
      ...sectionBlocks("s4", "Section 4 — What's On"),
      { key: "gallery_eyebrow", label: "Gallery · small label", type: "text" },
      { key: "gallery_title", label: "Gallery · heading", type: "text" },
      {
        key: "gallery",
        label: "Gallery · photos",
        type: "gallery",
        hint: "Add up to 9 photos of the venue. They'll appear in a responsive 3-column grid (1 column on mobile). Drag to reorder, click × to remove.",
      },
    ],
  },
  {
    slug: "snooker",
    label: "Snooker",
    blocks: [
      ...pageBlocks(),
      { key: "s1_eyebrow", label: "Section 1 — The Tables · small label", type: "text" },
      { key: "s1_title", label: "Section 1 — The Tables · heading", type: "text" },
      { key: "s1_body", label: "Section 1 — The Tables · body copy", type: "textarea", hint: "Two-paragraph intro. Use a blank line to break paragraphs." },
      { key: "s1_image", label: "Section 1 — Tables photo", type: "image_url", hint: "Upload a photo of your tables to replace the placeholder." },
      ...sectionBlocks("s2", "Section 2 — Pricing"),
      ...sectionBlocks("s3", "Section 3 — Leagues"),
    ],
  },
  {
    slug: "dining",
    label: "Dining",
    blocks: [
      ...pageBlocks(),
      { key: "s1_eyebrow", label: "Section 1 — The Kitchen · small label", type: "text" },
      { key: "s1_title", label: "Section 1 — The Kitchen · heading", type: "text" },
      { key: "s1_body", label: "Section 1 — The Kitchen · body copy", type: "textarea" },
      { key: "s1_image", label: "Section 1 — Food photo", type: "image_url", hint: "Upload a hero food photo to replace the placeholder." },
      ...sectionBlocks("s2", "Section 2 — Sample Menu"),
    ],
  },
  {
    slug: "events",
    label: "Events",
    blocks: [
      ...pageBlocks(),
      ...sectionBlocks("s1", "Section 1 — Coming Up"),
      ...sectionBlocks("s2", "Section 2 — Every Week"),
      ...sectionBlocks("s3", "Section 3 — Host Your Event"),
    ],
  },
  {
    slug: "function-rooms",
    label: "Function Rooms",
    blocks: [
      ...pageBlocks(),
      { key: "s1_eyebrow", label: "Section 1 — The Space · small label", type: "text" },
      { key: "s1_title", label: "Section 1 — The Space · heading", type: "text" },
      { key: "s1_body", label: "Section 1 — The Space · body copy", type: "textarea" },
      { key: "s1_image", label: "Section 1 — Room photo", type: "image_url" },
      ...sectionBlocks("s2", "Section 2 — Spaces"),
      ...sectionBlocks("s3", "Section 3 — Packages"),
    ],
  },
  {
    slug: "gift-cards",
    label: "Gift Cards",
    blocks: [
      ...pageBlocks(),
      { key: "s1_eyebrow", label: "Section 1 — How They Work · small label", type: "text" },
      { key: "s1_title", label: "Section 1 — How They Work · heading", type: "text" },
      { key: "s1_body", label: "Section 1 — How They Work · body copy", type: "textarea" },
      { key: "s1_image", label: "Section 1 — Gift card photo", type: "image_url" },
      ...sectionBlocks("s2", "Section 2 — Choose an Amount"),
      { key: "s3_eyebrow", label: "Section 3 — Good to Know · small label", type: "text" },
      { key: "s3_title", label: "Section 3 — Good to Know · heading", type: "text" },
    ],
  },
  {
    slug: "contact",
    label: "Contact",
    blocks: [
      ...pageBlocks(),
      { key: "s1_eyebrow", label: "Send a Message · small label", type: "text" },
      { key: "s1_title", label: "Send a Message · heading", type: "text" },
      { key: "s1_body", label: "Send a Message · body copy", type: "textarea" },
    ],
  },
  {
    slug: "membership",
    label: "Membership",
    blocks: [
      ...pageBlocks(),
      ...sectionBlocks("s1", "Members' Perks"),
    ],
  },
];

const SITE_SLUG = "site";

const settingKey = (slug: string, key: string) => `web:${slug}:${key}`;

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Convert *word* into <em>word</em> after HTML-escaping. Allows owners to
// recreate the gold-italic accent on hero headlines as plain text.
export function renderWebText(value: string): string {
  return escapeHtml(value).replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

// Safely escape a URL for inside `style="background-image:url('...')"` —
// strips control chars, percent-encodes the quote/backslash characters that
// could break out of the url(...) wrapper, and HTML-escapes & and < for
// the surrounding double-quoted attribute context.
function escapeImageUrl(url: string): string {
  return String(url)
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\\/g, "%5C")
    .replace(/'/g, "%27")
    .replace(/"/g, "%22")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Scheme-allowlist a URL meant for an <a href> / link target. Returns the
// trimmed URL on pass, empty string on fail. Rejects javascript:/vbscript:/
// data:/file: which would let a tampered override become a stored XSS vector.
// Allows: relative paths (starting with /, ./, ../, # or ?), protocol-relative
// (//host/...), https:, http:, mailto:, tel:.
export function isSafeLinkUrl(url: string): string {
  const v = String(url || "").trim().replace(/[\x00-\x1f\x7f]/g, "");
  if (!v) return "";
  if (/^(javascript|vbscript|data|file):/i.test(v)) return "";
  if (/^[\/#?]/.test(v)) return v;
  if (v.startsWith("//")) return v;
  if (/^(https?:|mailto:|tel:)/i.test(v)) return v;
  // Anything else (e.g. unschemed `example.com`) is too ambiguous to trust.
  return "";
}

// Scheme-allowlist a URL meant for an <img src> or CSS background-image. Same
// rules as isSafeLinkUrl PLUS allows `data:image/<format>` (uploaded images
// are persisted as data URIs by the existing image-upload endpoint). Rejects
// `data:text/html` and other non-image data URIs.
export function isSafeImageUrl(url: string): string {
  const v = String(url || "").trim().replace(/[\x00-\x1f\x7f]/g, "");
  if (!v) return "";
  if (/^(javascript|vbscript|file):/i.test(v)) return "";
  if (/^data:/i.test(v)) return /^data:image\/[a-z0-9+.\-]+[;,]/i.test(v) ? v : "";
  if (/^[\/#?]/.test(v)) return v;
  if (v.startsWith("//")) return v;
  if (/^https?:/i.test(v)) return v;
  return "";
}

// Validate a colour value as #RGB or #RRGGBB. Returns sanitised hex on success
// or empty string on failure (caller falls back to the captured default).
function sanitizeColor(value: string): string {
  const trimmed = String(value || "").trim();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  return "";
}

// Render a multi-image photo gallery from a JSON array of URLs. Empty / invalid
// payloads fall back to the captured default markup, so removing every photo
// reveals whatever placeholder the template originally shipped with. Each URL
// is filtered through isSafeImageUrl as render-time defence-in-depth.
function renderGallery(value: string, defaultInner: string): string {
  if (!value) return defaultInner;
  let urls: string[] = [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return defaultInner;
    urls = parsed
      .map((u: any) => (typeof u === "string" ? isSafeImageUrl(u) : ""))
      .filter((u): u is string => !!u);
  } catch {
    return defaultInner;
  }
  if (!urls.length) return defaultInner;
  return (
    `<div class="gallery-grid">` +
    urls
      .map(
        (u) =>
          `<div class="gallery-item" style="background-image:url('${escapeImageUrl(
            u,
          )}')"></div>`,
      )
      .join("") +
    `</div>`
  );
}

// Render the navigation links list. The current page's slug determines which
// link gets the `active` class. JSON parse errors fall back to DEFAULT_NAV
// silently so a malformed override never breaks the marketing site.
function renderNav(value: string, currentPageSlug: string): string {
  let links: NavLinkDef[] = DEFAULT_NAV;
  if (value) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        links = parsed
          .map((l: any): NavLinkDef | null => {
            if (!l || typeof l !== "object") return null;
            if (typeof l.label !== "string" || typeof l.href !== "string") return null;
            const slug = typeof l.slug === "string" ? l.slug : "";
            const style: NavLinkDef["style"] =
              l.style === "cta" || l.style === "order" ? l.style : "default";
            return { label: l.label, href: l.href, slug, style, hidden: !!l.hidden };
          })
          .filter((l): l is NavLinkDef => l !== null);
        if (!links.length) links = DEFAULT_NAV;
      }
    } catch {
      links = DEFAULT_NAV;
    }
  }
  return links
    .filter((l) => !l.hidden)
    .map((l) => {
      // Defence-in-depth: even though saveOverride blocks unsafe URLs at write
      // time, validate at render time so a tampered DB row can never produce a
      // javascript:/vbscript: link in public HTML.
      const safeHref = isSafeLinkUrl(l.href);
      if (!safeHref) return "";
      const classes: string[] = [];
      if (l.style === "cta") classes.push("nav-cta");
      if (l.style === "order") classes.push("nav-order");
      if (l.slug && l.slug === currentPageSlug) classes.push("active");
      const cls = classes.length ? ` class="${classes.join(" ")}"` : "";
      return `<a href="${escapeHtml(safeHref)}"${cls}>${escapeHtml(l.label)}</a>`;
    })
    .filter(Boolean)
    .join("\n      ");
}

// Render a single block value into the HTML stream based on its field type.
// `defaultInner` is the literal HTML that sat between the markers in the
// source template — it's our fallback whenever a typed value is empty or
// otherwise unusable.
function substituteBlock(
  value: string,
  type: WebFieldType,
  pageSlug: string,
  blockKey: string,
  defaultInner: string,
  full: string,
  currentPageSlug: string,
): string {
  switch (type) {
    case "image": {
      const safe = isSafeImageUrl(value);
      if (!safe) return "";
      return (
        ";background-image:" +
        "linear-gradient(180deg,rgba(13,13,13,.55) 0%,rgba(13,13,13,.85) 100%)," +
        `url('${escapeImageUrl(safe)}');background-size:cover;background-position:center`
      );
    }
    case "image_html": {
      const safe = isSafeImageUrl(value);
      if (!safe) return defaultInner;
      return `<img src="${escapeImageUrl(safe)}" alt="The 147" class="custom-logo" />`;
    }
    case "image_url": {
      const safe = isSafeImageUrl(value);
      if (!safe) return defaultInner.trim();
      return escapeImageUrl(safe);
    }
    case "attr_text":
      if (!value) return defaultInner.trim();
      return escapeHtml(value);
    case "color": {
      const safe = sanitizeColor(value);
      return safe || defaultInner.trim();
    }
    case "nav":
      return renderNav(value, currentPageSlug);
    case "bar":
      if (!value) return "";
      return `<div class="announcement-bar">${escapeHtml(value)}</div>`;
    case "gallery":
      return renderGallery(value, defaultInner);
    case "text":
    case "textarea":
    default:
      if (!value) return full;
      return `<!--WEB:${pageSlug}:${blockKey}-->${renderWebText(value)}<!--/WEB-->`;
  }
}

// Substitute <!--WEB:slug:key-->default<!--/WEB--> with override (if present)
// in the given HTML. Both the page-specific overrides AND the site-wide
// overrides are applied; defaults stay in place when no override is saved,
// so the file content is always the safe fallback.
export async function applyWebContentOverrides(slug: string, html: string): Promise<string> {
  const [pageOverrides, siteOverrides] = await Promise.all([
    loadOverridesForPage(slug),
    loadOverridesForPage(SITE_SLUG),
  ]);
  const pageDef = WEB_PAGES.find((p) => p.slug === slug);
  const siteDef = WEB_PAGES.find((p) => p.slug === SITE_SLUG);
  return html.replace(
    /<!--WEB:([a-z0-9_\-]+):([a-z0-9_\-]+)-->([\s\S]*?)<!--\/WEB-->/g,
    (full, pageSlug: string, blockKey: string, defaultInner: string) => {
      let value = "";
      let blockType: WebFieldType | undefined;
      if (pageSlug === slug) {
        value = pageOverrides[blockKey] ?? "";
        blockType = pageDef?.blocks.find((b) => b.key === blockKey)?.type;
      } else if (pageSlug === SITE_SLUG) {
        value = siteOverrides[blockKey] ?? "";
        blockType = siteDef?.blocks.find((b) => b.key === blockKey)?.type;
      } else {
        return full;
      }
      if (!blockType) return full;
      return substituteBlock(value, blockType, pageSlug, blockKey, defaultInner, full, slug);
    },
  );
}

async function loadOverridesForPage(slug: string): Promise<Record<string, string>> {
  const page = WEB_PAGES.find((p) => p.slug === slug);
  if (!page) return {};
  const out: Record<string, string> = {};
  await Promise.all(
    page.blocks.map(async (b) => {
      try {
        const v = await storage.getSetting(settingKey(slug, b.key));
        if (v != null && v !== "") out[b.key] = v;
      } catch {
        /* ignore */
      }
    }),
  );
  return out;
}

// ── Custom (DB-backed) marketing page renderer ───────────────────────────
// Owners can create new pages from the staff portal. Each page persists in
// `marketing_pages` and is rendered with the standard nav / footer / hero
// shell so it inherits all the site-wide overrides (logo, colours, nav,
// announcement, footer copy) for free. The body is owner-supplied HTML —
// we strip <script> / <style> / on*= handlers / javascript: URLs as a
// hygiene net but otherwise let real markup through (the page-builder is
// explicitly an owner-trusted surface).

const SCRIPT_TAG_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const STYLE_TAG_RE = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
// Strip whole tags that load executable / cross-origin content. Owners get
// `<img>`, links and basic markup but not iframes/objects/embeds/SVGs.
const DANGEROUS_TAG_RE = /<\/?(?:iframe|object|embed|svg|math|link|meta|base|form|input|button|textarea|select|frame|frameset)\b[^>]*>/gi;
const ON_HANDLER_RE = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
// Match URL-bearing attrs whose value (quoted OR unquoted) starts with an
// executable scheme. Whitespace and HTML entity encodings (&#x6a; &#106;) for
// the leading characters are normalised before matching.
const URL_ATTR_RE = /\b(href|src|srcset|action|formaction|background|poster|xlink:href|data)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_SCHEME_RE = /^(?:javascript|vbscript|livescript|mocha|data\s*:\s*text\/html)\s*:/i;

// Named HTML entities that could be used to bypass scheme checks in URLs.
// Only characters relevant to URL/scheme injection are included intentionally;
// a full entity map is not needed here.
const NAMED_ENTITY_MAP: Record<string, string> = {
  colon: ":",
  lpar: "(",
  rpar: ")",
  sol: "/",
  bsol: "\\",
  period: ".",
  comma: ",",
  semi: ";",
  lt: "<",
  gt: ">",
  amp: "&",
  quot: '"',
  apos: "'",
  Tab: "\t",
  NewLine: "\n",
};

function decodeAttrEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?|&#(\d+);?/gi, (_m, hex, dec) => {
      const code = hex ? parseInt(hex, 16) : parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : "";
    })
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (_m, name: string) => {
      return Object.prototype.hasOwnProperty.call(NAMED_ENTITY_MAP, name)
        ? NAMED_ENTITY_MAP[name]
        : _m;
    });
}

function sanitizeBodyHtml(html: string): string {
  return String(html || "")
    .replace(SCRIPT_TAG_RE, "")
    .replace(STYLE_TAG_RE, "")
    .replace(DANGEROUS_TAG_RE, "")
    .replace(ON_HANDLER_RE, "")
    .replace(URL_ATTR_RE, (full, attr: string, raw: string) => {
      let value = raw;
      let quote = "";
      if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
        quote = raw[0];
        value = raw.slice(1, -1);
      }
      const normalized = decodeAttrEntities(value).replace(/[\s\u0000-\u001f]/g, "").toLowerCase();
      if (DANGEROUS_SCHEME_RE.test(normalized)) {
        return `${attr}=${quote}#${quote}`;
      }
      return full;
    });
}

export interface CustomPageInput {
  slug: string;
  title: string;
  heroEyebrow?: string | null;
  heroTitle?: string | null;
  heroSub?: string | null;
  heroBg?: string | null;
  bodyHtml?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

export function renderCustomPage(page: CustomPageInput): string {
  const safeHeroBg = page.heroBg ? isSafeImageUrl(page.heroBg) : "";
  const heroStyle = safeHeroBg
    ? `;background-image:linear-gradient(180deg,rgba(13,13,13,.55) 0%,rgba(13,13,13,.85) 100%),url('${escapeImageUrl(safeHeroBg)}');background-size:cover;background-position:center`
    : "";
  const metaTitle = escapeHtml(page.metaTitle?.trim() || `${page.title} — The 147 Bradford`);
  const metaDesc = escapeHtml(page.metaDescription?.trim() || page.title);
  const eyebrow = page.heroEyebrow?.trim()
    ? `<span class="hero-eyebrow">${escapeHtml(page.heroEyebrow)}</span>`
    : "";
  const title = renderWebText(page.heroTitle?.trim() || page.title);
  const sub = page.heroSub?.trim()
    ? `<p class="hero-sub">${escapeHtml(page.heroSub)}</p>`
    : "";
  const body = sanitizeBodyHtml(page.bodyHtml || "");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${metaTitle}</title>
<meta name="description" content="${metaDesc}" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/test-site/styles.css">
<style>:root{--blue:<!--WEB:site:color_blue-->#1E5BC6<!--/WEB-->;--gold:<!--WEB:site:color_gold-->#D9A93C<!--/WEB-->}</style>
</head>
<body>

<div class="preview-banner">Test Website — for review only · not yet live</div>
<!--WEB:site:announcement_text--><!--/WEB-->


<nav class="nav">
  <div class="nav-inner">
    <a href="/test-site" class="brand">
      <!--WEB:site:logo--><div class="brand-mark">147</div><div class="brand-text">The 1<span>4</span>7</div><!--/WEB-->
    </a>
    <div class="nav-links" id="navLinks">
      <!--WEB:site:nav_links-->
        <a href="/test-site">Home</a>
        <a href="/test-site/snooker">Snooker</a>
        <a href="/test-site/dining">Dining</a>
        <a href="/test-site/events">Events</a>
        <a href="/test-site/function-rooms">Function Rooms</a>
        <a href="/test-site/gift-cards">Gift Cards</a>
        <a href="/test-site/contact">Contact</a>
        <a href="/test-site/order" class="nav-order">Order</a>
        <a href="/test-site/book" class="nav-cta">Book a Table</a>
        <!--/WEB-->
    </div>
    <button class="menu-toggle" onclick="document.getElementById('navLinks').classList.toggle('open')" aria-label="Menu">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
  </div>
</nav>

<header class="hero" style="${heroStyle}">
  <div class="hero-content">
    ${eyebrow}
    <h1>${title}</h1>
    ${sub}
  </div>
</header>

<section>
  <div class="custom-page-body">
    ${body}
  </div>
</section>

<footer>
  <div class="footer-grid">
    <div>
      <div class="footer-brand-wrap"><!--WEB:site:logo--><div class="footer-brand">The 1<span>4</span>7</div><!--/WEB--></div>
      <p style="font-size:14px;color:#888;max-width:300px"><!--WEB:site:footer_tagline-->Bradford's premier snooker, pool &amp; dining venue. Tournament-grade tables, full bar, kitchen open late.<!--/WEB--></p>
    </div>
    <div class="footer-col"><h5>Visit</h5><ul><li><a href="/test-site/snooker">Snooker</a></li><li><a href="/test-site/dining">Dining</a></li><li><a href="/test-site/events">Events</a></li><li><a href="/test-site/function-rooms">Function Rooms</a></li></ul></div>
    <div class="footer-col"><h5>Members</h5><ul><li><a href="/membership">Plans &amp; Pricing</a></li><li><a href="/">Book a Table</a></li><li><a href="/test-site/gift-cards">Gift Cards</a></li></ul></div>
    <div class="footer-col"><h5>Contact</h5><ul><li><!--WEB:site:phone-->01274 000 000<!--/WEB--></li><li><!--WEB:site:email-->hello@the147bradford.co.uk<!--/WEB--></li><li><!--WEB:site:address_line1-->147 Example Street<!--/WEB--></li><li><!--WEB:site:address_line2-->Bradford BD1 1AA<!--/WEB--></li></ul></div>
  </div>
  <div class="footer-bottom"><div>© The 147 Bradford. All rights reserved.</div><div><a href="/privacy-policy">Privacy</a> · <a href="/terms">Terms</a></div></div>
</footer>
<script src="/test-site/embed.js" defer></script>
<script>document.querySelectorAll('#navLinks a').forEach(a=>a.addEventListener('click',()=>document.getElementById('navLinks').classList.remove('open')));</script>
</body></html>`;
}

// Slug used for the renderer's `currentPageSlug` parameter when a custom
// page is being rendered — owner can wire their nav link's `slug` field
// to match this prefix to highlight the custom page in nav.
export const CUSTOM_PAGE_SLUG_PREFIX = "custom:";

// Editor data shape — used by the staff portal API.
export interface WebBlockEditor extends WebBlockDef {
  value: string; // current saved override (empty string if none)
}
export interface WebPageEditor {
  slug: string;
  label: string;
  blocks: WebBlockEditor[];
}

export async function getEditorPayload(): Promise<WebPageEditor[]> {
  return await Promise.all(
    WEB_PAGES.map(async (page) => {
      const blocks: WebBlockEditor[] = await Promise.all(
        page.blocks.map(async (b) => {
          let value = "";
          try {
            const v = await storage.getSetting(settingKey(page.slug, b.key));
            if (v != null) value = v;
          } catch {
            /* ignore */
          }
          // For the nav block, hand the editor the default seed when nothing
          // is saved yet — gives the owner the full list to start editing.
          if (!value && b.type === "nav") {
            value = JSON.stringify(DEFAULT_NAV);
          }
          return { ...b, value };
        }),
      );
      return { slug: page.slug, label: page.label, blocks };
    }),
  );
}

export async function saveOverride(slug: string, key: string, value: string): Promise<void> {
  const page = WEB_PAGES.find((p) => p.slug === slug);
  if (!page) throw new Error("Unknown page");
  const block = page.blocks.find((b) => b.key === key);
  if (!block) throw new Error("Unknown block");
  const raw = String(value ?? "");
  // Belt-and-braces validation: reject unsafe URL schemes BEFORE persisting,
  // so a tampered request body can't sneak a javascript:/vbscript: payload
  // into the DB even if the render-time guard is later changed.
  if (raw) {
    if (block.type === "image" || block.type === "image_html" || block.type === "image_url") {
      if (!isSafeImageUrl(raw)) throw new Error("Unsafe image URL");
    } else if (block.type === "gallery") {
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("Invalid gallery JSON");
      }
      if (!Array.isArray(parsed)) throw new Error("Gallery must be an array");
      for (const u of parsed) {
        if (typeof u !== "string") throw new Error("Gallery entries must be strings");
        if (u && !isSafeImageUrl(u)) throw new Error("Unsafe gallery image URL");
      }
    } else if (block.type === "nav") {
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("Invalid nav JSON");
      }
      if (!Array.isArray(parsed)) throw new Error("Nav must be an array");
      for (const link of parsed) {
        if (!link || typeof link !== "object") continue;
        if (typeof link.href === "string" && link.href && !isSafeLinkUrl(link.href)) {
          throw new Error("Unsafe nav link URL");
        }
      }
    }
  }
  await storage.setSetting(settingKey(slug, key), raw);
}
