import type { Block } from "./types";

export interface BlockDef {
  type: string;
  label: string;
  icon: string;
  keywords: string[];
  defaults: Record<string, any>;
}

export const BLOCK_DEFS: BlockDef[] = [
  { type: "paragraph", label: "Paragraph", icon: "¶", keywords: ["text"], defaults: { text: "" } },
  { type: "heading", label: "Heading", icon: "H", keywords: ["title", "h2"], defaults: { text: "", level: 2 } },
  { type: "image", label: "Image", icon: "▣", keywords: ["photo", "picture"], defaults: { url: "", alt: "", caption: "" } },
  { type: "gallery", label: "Gallery", icon: "▦", keywords: ["images"], defaults: { images: [] } },
  { type: "list", label: "List", icon: "≣", keywords: ["bullet", "ul", "ol"], defaults: { ordered: false, items: [""] } },
  { type: "quote", label: "Quote", icon: "❝", keywords: ["blockquote"], defaults: { text: "", citation: "" } },
  { type: "pullquote", label: "Pullquote", icon: "❞", keywords: [], defaults: { text: "" } },
  { type: "code", label: "Code", icon: "</>", keywords: ["pre"], defaults: { text: "" } },
  { type: "verse", label: "Verse", icon: "V", keywords: ["poetry"], defaults: { text: "" } },
  { type: "separator", label: "Separator", icon: "—", keywords: ["hr", "divider"], defaults: {} },
  { type: "spacer", label: "Spacer", icon: "↕", keywords: ["gap"], defaults: { height: 40 } },
  { type: "html", label: "Custom HTML", icon: "<>", keywords: ["embed"], defaults: { html: "" } },
  { type: "buttons", label: "Buttons", icon: "▢", keywords: ["link", "cta"], defaults: { buttons: [{ text: "Button", url: "" }] } },
  { type: "cover", label: "Cover", icon: "▧", keywords: ["banner"], defaults: { url: "", text: "" } },
  { type: "embed", label: "Embed", icon: "⧉", keywords: ["video", "url"], defaults: { url: "" } },
];

let counter = 0;
export function newBlock(type: string): Block {
  const def = BLOCK_DEFS.find((d) => d.type === type) || BLOCK_DEFS[0];
  counter += 1;
  return {
    id: `blk_${Date.now().toString(36)}_${counter}`,
    type: def.type,
    attrs: JSON.parse(JSON.stringify(def.defaults)),
  };
}

export function blockLabel(type: string): string {
  return BLOCK_DEFS.find((d) => d.type === type)?.label || type;
}