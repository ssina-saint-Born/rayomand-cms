import React from "react";
import type { Block } from "./types";

export function sanitizeHtml(html: string): string {
  return (html || "")
    .replace(/<\s*(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form)[^>]*\/?\s*>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

export function blocksToPlainText(blocks: Block[]): string {
  const parts: string[] = [];
  for (const b of blocks || []) {
    const a = b.attrs || {};
    switch (b.type) {
      case "paragraph":
      case "heading":
      case "quote":
      case "code":
      case "verse":
      case "pullquote":
        parts.push(String(a.text || ""));
        break;
      case "list":
        parts.push((a.items || []).join(" "));
        break;
      case "html":
        parts.push(String(a.html || "").replace(/<[^>]+>/g, " "));
        break;
      case "buttons":
        parts.push((a.buttons || []).map((x: any) => x.text).join(" "));
        break;
      case "cover":
        parts.push(String(a.text || ""));
        break;
      default:
        break;
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function alignClass(align?: string): string {
  if (align === "center") return "text-center";
  if (align === "right") return "text-right";
  return "";
}

function RenderBlock({ block }: { block: Block }) {
  const a = block.attrs || {};
  switch (block.type) {
    case "paragraph":
      return (
        <p className={`rm-paragraph ${alignClass(a.align)}`}>
          {String(a.text || "")}
        </p>
      );
    case "heading": {
      // Every render context already has a page <h1>, so block headings are
      // clamped to h2+ to keep a single, SEO-correct heading hierarchy.
      const level = Math.min(6, Math.max(2, Number(a.level) || 2));
      const Tag = (`h${level}` as unknown) as keyof JSX.IntrinsicElements;
      return (
        <Tag className={`rm-heading ${alignClass(a.align)}`}>
          {String(a.text || "")}
        </Tag>
      );
    }
    case "image":
      return (
        <figure className="rm-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={String(a.url || "")} alt={String(a.alt || "")} loading="lazy" decoding="async" />
          {a.caption ? <figcaption>{String(a.caption)}</figcaption> : null}
        </figure>
      );
    case "gallery":
      return (
        <div className="rm-gallery">
          {(a.images || []).map((img: any, i: number) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={String(img.url || "")} alt={String(img.alt || "")} loading="lazy" decoding="async" />
          ))}
        </div>
      );
    case "list": {
      const items = (a.items || []) as string[];
      return a.ordered ? (
        <ol className="rm-list">{items.map((it, i) => <li key={i}>{it}</li>)}</ol>
      ) : (
        <ul className="rm-list">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
      );
    }
    case "quote":
      return (
        <blockquote className="rm-quote">
          <p>{String(a.text || "")}</p>
          {a.citation ? <cite>{String(a.citation)}</cite> : null}
        </blockquote>
      );
    case "pullquote":
      return (
        <blockquote className="rm-pullquote">
          <p>{String(a.text || "")}</p>
        </blockquote>
      );
    case "code":
      return (
        <pre className="rm-code"><code>{String(a.text || "")}</code></pre>
      );
    case "verse":
      return <pre className="rm-verse">{String(a.text || "")}</pre>;
    case "separator":
      return <hr className="rm-separator" />;
    case "spacer":
      return <div style={{ height: Number(a.height) || 40 }} />;
    case "html":
      return (
        <div
          className="rm-html"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(a.html || "")) }}
        />
      );
    case "buttons":
      return (
        <div className="rm-buttons">
          {(a.buttons || []).map((b: any, i: number) => (
            <a key={i} className="rm-button" href={String(b.url || "#")}>
              {String(b.text || "Button")}
            </a>
          ))}
        </div>
      );
    case "cover":
      return (
        <div
          className="rm-cover"
          style={{ backgroundImage: `url(${String(a.url || "")})` }}
        >
          <div className="rm-cover-inner">
            <p>{String(a.text || "")}</p>
          </div>
        </div>
      );
    case "embed":
      return (
        <div className="rm-embed">
          <a href={String(a.url || "#")} target="_blank" rel="noreferrer">
            {String(a.url || "")}
          </a>
        </div>
      );
    default:
      return null;
  }
}

export function RenderBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="rm-blocks">
      {(blocks || []).map((b) => (
        <RenderBlock key={b.id} block={b} />
      ))}
    </div>
  );
}