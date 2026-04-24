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
// Site-wide blocks: the special "site" pseudo-page is applied across EVERY
// rendered marketing page (used for phone, email, address, hours, footer copy
// etc. that appears in headers/footers).
//
// Image blocks: stored as URLs (typically `data:image/jpeg;base64,...` returned
// by the upload endpoint, but external https:// URLs work too). Images are
// emitted as raw CSS background-image declarations so they can be dropped
// into a `style="..."` attribute on the hero element.

import { storage } from "./storage";

export type WebFieldType = "text" | "textarea" | "image";

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

const HERO_BG_HINT =
  "Recommended size: 1920×1080 landscape. Upload a photo of your venue, or paste an image URL. A dark overlay is added automatically so headline text stays legible.";

// Per-page hero blocks shared across the 7 marketing pages.
const heroBlocks = (titleHint?: string): WebBlockDef[] => [
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

// Single source of truth for editable blocks. Add new entries here and
// place matching <!--WEB:slug:key-->...<!--/WEB--> markers in the HTML.
export const WEB_PAGES: WebPageDef[] = [
  {
    slug: "site",
    label: "Site-wide",
    blocks: [
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
  { slug: "home", label: "Home", blocks: heroBlocks() },
  { slug: "snooker", label: "Snooker", blocks: heroBlocks() },
  { slug: "dining", label: "Dining", blocks: heroBlocks() },
  { slug: "events", label: "Events", blocks: heroBlocks() },
  { slug: "function-rooms", label: "Function Rooms", blocks: heroBlocks() },
  { slug: "gift-cards", label: "Gift Cards", blocks: heroBlocks() },
  { slug: "contact", label: "Contact", blocks: heroBlocks() },
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

// Render a single block value into the HTML stream based on its field type.
// - text/textarea: keeps the comment markers and escapes + applies *em*.
// - image: emits a leading `;` followed by a CSS declaration list. The leading
//   semicolon ensures the substituted CSS is parsed correctly when injected
//   inside a style="..." attribute (any garbage from the comment markers
//   before the leading `;` is treated as a malformed declaration and skipped
//   by the CSS parser).
function substituteBlock(value: string, type: WebFieldType, pageSlug: string, blockKey: string): string {
  if (type === "image") {
    if (!value) return "";
    const safe = escapeImageUrl(value);
    return (
      ";background-image:" +
      "linear-gradient(180deg,rgba(13,13,13,.55) 0%,rgba(13,13,13,.85) 100%)," +
      `url('${safe}');background-size:cover;background-position:center`
    );
  }
  return `<!--WEB:${pageSlug}:${blockKey}-->${renderWebText(value)}<!--/WEB-->`;
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
    /<!--WEB:([a-z0-9_\-]+):([a-z0-9_\-]+)-->[\s\S]*?<!--\/WEB-->/g,
    (full, pageSlug: string, blockKey: string) => {
      let value: string | undefined;
      let blockType: WebFieldType | undefined;
      if (pageSlug === slug) {
        value = pageOverrides[blockKey];
        blockType = pageDef?.blocks.find((b) => b.key === blockKey)?.type;
      } else if (pageSlug === SITE_SLUG) {
        value = siteOverrides[blockKey];
        blockType = siteDef?.blocks.find((b) => b.key === blockKey)?.type;
      } else {
        return full;
      }
      // No override saved → keep the file default untouched.
      if (value == null || value === "") {
        // For image blocks, an empty override means "emit nothing" so the
        // raw markers inside the style attribute are dropped (CSS parser
        // would otherwise see garbage).
        if (blockType === "image") return "";
        return full;
      }
      if (!blockType) return full;
      return substituteBlock(value, blockType, pageSlug, blockKey);
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
  if (!page.blocks.find((b) => b.key === key)) throw new Error("Unknown block");
  await storage.setSetting(settingKey(slug, key), String(value ?? ""));
}
