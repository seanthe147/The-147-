// Owner-only website content overrides for the /test-site marketing pages.
// Each editable block is marked in the HTML with a comment pair:
//   <!--WEB:home:hero_title-->Default text here<!--/WEB-->
// On render, this module substitutes the inner content with any saved
// override from the site_settings table (key = "web:<page>:<blockKey>").
// Owners edit overrides via the Website section in the staff portal.
//
// Markdown-style accent: a *word* in the override is rendered as <em>word</em>
// so the gold-coloured italic accent in headlines remains editable as plain text.

import { storage } from "./storage";

export type WebFieldType = "text" | "textarea";

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

// Single source of truth for editable blocks. Add new entries here and
// place matching <!--WEB:slug:key-->...<!--/WEB--> markers in the HTML.
export const WEB_PAGES: WebPageDef[] = [
  {
    slug: "home",
    label: "Home",
    blocks: [
      { key: "hero_eyebrow", label: "Hero · small label", type: "text" },
      { key: "hero_title", label: "Hero · headline", type: "text", hint: "Use *word* to highlight a word in gold italic." },
      { key: "hero_sub", label: "Hero · subtitle", type: "textarea" },
    ],
  },
  {
    slug: "snooker",
    label: "Snooker",
    blocks: [
      { key: "hero_eyebrow", label: "Hero · small label", type: "text" },
      { key: "hero_title", label: "Hero · headline", type: "text", hint: "Use *word* to highlight a word in gold italic." },
      { key: "hero_sub", label: "Hero · subtitle", type: "textarea" },
    ],
  },
  {
    slug: "dining",
    label: "Dining",
    blocks: [
      { key: "hero_eyebrow", label: "Hero · small label", type: "text" },
      { key: "hero_title", label: "Hero · headline", type: "text", hint: "Use *word* to highlight a word in gold italic." },
      { key: "hero_sub", label: "Hero · subtitle", type: "textarea" },
    ],
  },
  {
    slug: "events",
    label: "Events",
    blocks: [
      { key: "hero_eyebrow", label: "Hero · small label", type: "text" },
      { key: "hero_title", label: "Hero · headline", type: "text", hint: "Use *word* to highlight a word in gold italic." },
      { key: "hero_sub", label: "Hero · subtitle", type: "textarea" },
    ],
  },
  {
    slug: "function-rooms",
    label: "Function Rooms",
    blocks: [
      { key: "hero_eyebrow", label: "Hero · small label", type: "text" },
      { key: "hero_title", label: "Hero · headline", type: "text", hint: "Use *word* to highlight a word in gold italic." },
      { key: "hero_sub", label: "Hero · subtitle", type: "textarea" },
    ],
  },
  {
    slug: "gift-cards",
    label: "Gift Cards",
    blocks: [
      { key: "hero_eyebrow", label: "Hero · small label", type: "text" },
      { key: "hero_title", label: "Hero · headline", type: "text", hint: "Use *word* to highlight a word in gold italic." },
      { key: "hero_sub", label: "Hero · subtitle", type: "textarea" },
    ],
  },
  {
    slug: "contact",
    label: "Contact",
    blocks: [
      { key: "hero_eyebrow", label: "Hero · small label", type: "text" },
      { key: "hero_title", label: "Hero · headline", type: "text", hint: "Use *word* to highlight a word in gold italic." },
      { key: "hero_sub", label: "Hero · subtitle", type: "textarea" },
    ],
  },
];

const settingKey = (slug: string, key: string) => `web:${slug}:${key}`;

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Convert *word* into <em>word</em> after HTML-escaping. Allows owners to
// recreate the gold-italic accent on hero headlines as plain text.
export function renderWebText(value: string): string {
  return escapeHtml(value).replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}

// Substitute <!--WEB:slug:key-->default<!--/WEB--> with override (if present)
// in the given HTML for a single page slug. Defaults stay in place when no
// override is saved, so the file content is always the safe fallback.
export async function applyWebContentOverrides(slug: string, html: string): Promise<string> {
  const overrides = await loadOverridesForPage(slug);
  if (!overrides || Object.keys(overrides).length === 0) return html;
  return html.replace(
    /<!--WEB:([a-z0-9_\-]+):([a-z0-9_\-]+)-->[\s\S]*?<!--\/WEB-->/g,
    (full, pageSlug: string, blockKey: string) => {
      if (pageSlug !== slug) return full;
      const v = overrides[blockKey];
      if (v == null || v === "") return full;
      return `<!--WEB:${pageSlug}:${blockKey}-->${renderWebText(v)}<!--/WEB-->`;
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
