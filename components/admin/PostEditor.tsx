"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Block, Media, Post, Term } from "@/lib/types";
import { BLOCK_DEFS, newBlock, blockLabel } from "@/lib/block-defs";
import { RenderBlocks } from "@/lib/blocks";
import { api } from "@/lib/client";
import MediaPicker from "./MediaPicker";
import { Notice } from "./ui";
type PickerTarget = {
    kind: "block";
    id: string;
    field: string;
} | {
    kind: "gallery";
    id: string;
} | {
    kind: "featured";
} | {
    kind: "seoimage";
} | null;
function BlockEdit({ block, onChange, openPicker, }: {
    block: Block;
    onChange: (attrs: Record<string, any>) => void;
    openPicker: (t: PickerTarget) => void;
}) {
    const { t: tr } = useI18n();
    const a = block.attrs;
    const set = (patch: Record<string, any>) => onChange({ ...a, ...patch });
    switch (block.type) {
        case "paragraph":
            return (<textarea className="rm-input min-h-[80px] resize-y" placeholder={tr("Start writing…")} value={a.text || ""} onChange={(e) => set({ text: e.target.value })}/>);
        case "heading":
            return (<div className="flex gap-2 items-center">
          <select className="rm-input w-20" value={a.level || 2} onChange={(e) => set({ level: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6].map((l) => <option key={l} value={l}>{tr("H")}{l}</option>)}
          </select>
          <input className="rm-input" placeholder={tr("Heading")} value={a.text || ""} onChange={(e) => set({ text: e.target.value })}/>
        </div>);
        case "image":
        case "cover":
            return (<div className="space-y-2">
          {a.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.alt || ""} className="max-h-48 rounded border border-rm-border"/>) : null}
          <div className="flex gap-2">
            <button className="rm-btn rm-btn-secondary" onClick={() => openPicker({ kind: "block", id: block.id, field: "url" })}>
              {a.url ? tr("Replace image") : tr("Select image")}
            </button>
            {a.url && <button className="rm-btn rm-btn-ghost" onClick={() => set({ url: "" })}>{tr("Remove")}</button>}
          </div>
          {block.type === "image" ? (<>
              <input className="rm-input" placeholder={tr("Alt text")} value={a.alt || ""} onChange={(e) => set({ alt: e.target.value })}/>
              <input className="rm-input" placeholder={tr("Caption (optional)")} value={a.caption || ""} onChange={(e) => set({ caption: e.target.value })}/>
            </>) : (<input className="rm-input" placeholder={tr("Cover text")} value={a.text || ""} onChange={(e) => set({ text: e.target.value })}/>)}
        </div>);
        case "gallery":
            return (<div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {(a.images || []).map((img: any, i: number) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={img.url} alt="" className="w-full h-16 object-cover rounded border border-rm-border"/>))}
          </div>
          <button className="rm-btn rm-btn-secondary" onClick={() => openPicker({ kind: "gallery", id: block.id })}>{tr("Add image")}</button>
        </div>);
        case "list": {
            const items: string[] = a.items || [""];
            return (<div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!a.ordered} onChange={(e) => set({ ordered: e.target.checked })}/> {tr("Ordered list")}</label>
          {items.map((it, i) => (<div key={i} className="flex gap-2">
              <input className="rm-input" value={it} onChange={(e) => {
                        const next = [...items];
                        next[i] = e.target.value;
                        set({ items: next });
                    }}/>
              <button className="rm-btn rm-btn-ghost" onClick={() => set({ items: items.filter((_, j) => j !== i) })}>×</button>
            </div>))}
          <button className="rm-btn rm-btn-ghost" onClick={() => set({ items: [...items, ""] })}>{tr("+ Add item")}</button>
        </div>);
        }
        case "quote":
        case "pullquote":
        case "verse":
            return (<div className="space-y-2">
          <textarea className="rm-input min-h-[70px]" placeholder={tr("Text")} value={a.text || ""} onChange={(e) => set({ text: e.target.value })}/>
          {block.type === "quote" && <input className="rm-input" placeholder={tr("Citation")} value={a.citation || ""} onChange={(e) => set({ citation: e.target.value })}/>}
        </div>);
        case "code":
            return <textarea className="rm-input min-h-[100px] font-mono text-sm" placeholder={tr("Code")} value={a.text || ""} onChange={(e) => set({ text: e.target.value })}/>;
        case "html":
            return <textarea className="rm-input min-h-[100px] font-mono text-sm" placeholder={tr("<p>Custom HTML</p>")} value={a.html || ""} onChange={(e) => set({ html: e.target.value })}/>;
        case "separator":
            return <hr className="border-t-2 border-rm-border w-24 mx-auto"/>;
        case "spacer":
            return (<label className="flex items-center gap-2 text-sm">{tr("Height (px)")}<input type="number" className="rm-input w-28" value={a.height || 40} onChange={(e) => set({ height: Number(e.target.value) })}/>
        </label>);
        case "buttons": {
            const buttons = a.buttons || [{ text: "Button", url: "" }];
            return (<div className="space-y-2">
          {buttons.map((b: any, i: number) => (<div key={i} className="flex gap-2">
              <input className="rm-input" placeholder={tr("Label")} value={b.text} onChange={(e) => {
                        const next = [...buttons];
                        next[i] = { ...b, text: e.target.value };
                        set({ buttons: next });
                    }}/>
              <input className="rm-input" placeholder="https://" value={b.url} onChange={(e) => {
                        const next = [...buttons];
                        next[i] = { ...b, url: e.target.value };
                        set({ buttons: next });
                    }}/>
              <button className="rm-btn rm-btn-ghost" onClick={() => set({ buttons: buttons.filter((_: any, j: number) => j !== i) })}>×</button>
            </div>))}
          <button className="rm-btn rm-btn-ghost" onClick={() => set({ buttons: [...buttons, { text: "Button", url: "" }] })}>{tr("+ Add button")}</button>
        </div>);
        }
        case "embed":
            return <input className="rm-input" placeholder="https://…" value={a.url || ""} onChange={(e) => set({ url: e.target.value })}/>;
        default:
            return <p className="text-sm text-rm-muted">{tr("Unsupported block.")}</p>;
    }
}
export default function PostEditor({ postId, type }: {
    postId?: number;
    type: "post" | "page";
}) {
    const { t: tr } = useI18n();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [blocks, setBlocks] = useState<Block[]>([newBlock("paragraph")]);
    const [excerpt, setExcerpt] = useState("");
    const [status, setStatus] = useState("draft");
    const [categoryIds, setCategoryIds] = useState<number[]>([]);
    const [tagIds, setTagIds] = useState<number[]>([]);
    const [featured, setFeatured] = useState<Media | null>(null);
    const [commentStatus, setCommentStatus] = useState<"open" | "closed">("open");
    const [sticky, setSticky] = useState(false);
    const [format, setFormat] = useState("standard");
    const [categories, setCategories] = useState<Term[]>([]);
    const [tags, setTags] = useState<Term[]>([]);
    const [saving, setSaving] = useState(false);
    // SEO / social overrides
    const [seoTitle, setSeoTitle] = useState("");
    const [seoDescription, setSeoDescription] = useState("");
    const [seoCanonical, setSeoCanonical] = useState("");
    const [seoImage, setSeoImage] = useState("");
    const [seoNoindex, setSeoNoindex] = useState(false);
    // Scheduling (status === "future")
    const [scheduledAt, setScheduledAt] = useState("");
    const [message, setMessage] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);
    const [inserterOpen, setInserterOpen] = useState(false);
    const [preview, setPreview] = useState(false);
    const [picker, setPicker] = useState<PickerTarget>(null);
    const [newCat, setNewCat] = useState("");
    const [newTag, setNewTag] = useState("");
    const [savedId, setSavedId] = useState<number | undefined>(postId);
    const loadTerms = useCallback(async () => {
        const [c, t] = await Promise.all([
            api<Term[]>("/api/content/categories"),
            api<Term[]>("/api/content/tags"),
        ]);
        setCategories(c);
        setTags(t);
    }, []);
    useEffect(() => {
        (async () => {
            await loadTerms();
            if (postId) {
                try {
                    const p = await api<Post>(`/api/content/${type === "page" ? "pages" : "posts"}/${postId}`);
                    setTitle(p.title);
                    setSlug(p.slug);
                    setBlocks(p.content.length ? p.content : [newBlock("paragraph")]);
                    setExcerpt(p.excerpt);
                    setStatus(p.status);
                    setCategoryIds((p.categories || []).map((c) => c.id));
                    setTagIds((p.tags || []).map((t) => t.id));
                    setFeatured(p.featured_media || null);
                    setCommentStatus(p.comment_status);
                    setSticky(!!p.sticky);
                    setFormat(p.format);
                    if (p.status === "future" && p.published_at) {
                        // datetime-local wants local wall-clock, not ISO-Z.
                        const d = new Date(p.published_at);
                        const pad = (n: number) => String(n).padStart(2, "0");
                        setScheduledAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
                    }
                    const s = p.seo || {};
                    setSeoTitle(s.seo_title || "");
                    setSeoDescription(s.seo_description || "");
                    setSeoCanonical(s.seo_canonical || "");
                    setSeoImage(s.seo_image || "");
                    setSeoNoindex(s.seo_noindex === "1");
                }
                catch (e: any) {
                    setMessage({ type: "error", text: e.message });
                }
            }
            setLoading(false);
        })();
    }, [postId, type, loadTerms]);
    function updateBlock(id: string, attrs: Record<string, any>) {
        setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, attrs } : b)));
    }
    function addBlock(t: string) {
        setBlocks((prev) => [...prev, newBlock(t)]);
        setInserterOpen(false);
    }
    function moveBlock(id: string, dir: -1 | 1) {
        setBlocks((prev) => {
            const i = prev.findIndex((b) => b.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= prev.length)
                return prev;
            const next = [...prev];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
    }
    function removeBlock(id: string) {
        setBlocks((prev) => prev.filter((b) => b.id !== id));
    }
    function onPick(m: Media) {
        if (!picker)
            return;
        if (picker.kind === "featured")
            setFeatured(m);
        else if (picker.kind === "seoimage")
            setSeoImage(m.url || "");
        else if (picker.kind === "gallery") {
            const b = blocks.find((x) => x.id === picker.id);
            if (b)
                updateBlock(picker.id, { ...b.attrs, images: [...(b.attrs.images || []), { url: m.url, alt: m.alt }] });
        }
        else {
            const b = blocks.find((x) => x.id === picker.id);
            if (b)
                updateBlock(picker.id, { ...b.attrs, [picker.field]: m.url, alt: m.alt });
        }
        setPicker(null);
    }
    async function addTerm(tax: "category" | "tag") {
        const name = tax === "category" ? newCat : newTag;
        if (!name.trim())
            return;
        try {
            const term = await api<Term>(`/api/content/${tax === "category" ? "categories" : "tags"}`, {
                method: "POST",
                body: JSON.stringify({ name }),
            });
            await loadTerms();
            if (tax === "category") {
                setCategoryIds((p) => [...p, term.id]);
                setNewCat("");
            }
            else {
                setTagIds((p) => [...p, term.id]);
                setNewTag("");
            }
        }
        catch (e: any) {
            setMessage({ type: "error", text: e.message });
        }
    }
    async function save(newStatus?: string) {
        setSaving(true);
        setMessage(null);
        const payload = {
            title, slug, content: blocks, excerpt,
            status: newStatus || status,
            category_ids: categoryIds, tag_ids: tagIds,
            featured_media_id: featured ? featured.id : null,
            comment_status: commentStatus, sticky: sticky ? 1 : 0, format,
            scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
            seo_title: seoTitle,
            seo_description: seoDescription,
            seo_canonical: seoCanonical,
            seo_image: seoImage,
            seo_noindex: seoNoindex ? "1" : "",
        };
        try {
            const base = `/api/content/${type === "page" ? "pages" : "posts"}`;
            let result: Post;
            if (savedId)
                result = await api<Post>(`${base}/${savedId}`, { method: "PATCH", body: JSON.stringify(payload) });
            else
                result = await api<Post>(base, { method: "POST", body: JSON.stringify(payload) });
            setSavedId(result.id);
            setStatus(result.status);
            setSlug(result.slug);
            setMessage({ type: "success", text: tr("{0} saved ({1}).", { "0": tr(type === "page" ? "Page" : "Post"), "1": tr(result.status) }) });
            if (!postId)
                router.replace(`/studio/editor/${result.id}`);
        }
        catch (e: any) {
            setMessage({ type: "error", text: e.message });
        }
        setSaving(false);
    }
    if (loading)
        return <p className="text-rm-muted text-sm">{tr("Loading editor…")}</p>;
    const toggle = (arr: number[], id: number) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
    return (<div>
      <div className="noma-editor-toolbar">
        <h1 className="text-[23px] text-rm-dark">{postId ? tr("Edit {0}", {"0": tr(type === "page" ? "Page" : "Post")}) : tr("Add New {0}", {"0": tr(type === "page" ? "Page" : "Post")})}</h1>
        <div className="flex items-center gap-2">
          {savedId && status === "publish" && (<a className="rm-btn rm-btn-ghost" href={`/read/${slug}`} target="_blank" rel="noreferrer">{tr("View")}</a>)}
          <button className="rm-btn rm-btn-secondary" onClick={() => setPreview((p) => !p)}>{preview ? tr("Edit") : tr("Preview")}</button>
          <button className="rm-btn rm-btn-secondary" disabled={saving} onClick={() => save("draft")}>{tr("Save Draft")}</button>
          {status === "future" ? (
            <button className="rm-btn rm-btn-primary" disabled={saving || !scheduledAt} onClick={() => save("future")}>{saving ? tr("Saving…") : tr("Schedule")}</button>
          ) : (
            <button className="rm-btn rm-btn-primary" disabled={saving} onClick={() => save("publish")}>{saving ? tr("Saving…") : status === "publish" ? tr("Update") : tr("Publish")}</button>
          )}
        </div>
      </div>

      {message && <Notice type={message.type}>{tr(message.text)}</Notice>}

      <div className="noma-editor-layout">
        <div className="rm-admin-card noma-editor-canvas">
          {preview ? (<div>
              <h1 className="text-3xl font-bold mb-4">{title || tr("(no title)")}</h1>
              <RenderBlocks blocks={blocks}/>
            </div>) : (<div>
              <input className="noma-editor-title" placeholder={tr("Add title")} value={title} onChange={(e) => setTitle(e.target.value)}/>
              <div className="space-y-3">
                {blocks.map((b, i) => (<div key={b.id} className="noma-editor-block group">
                    <div className="noma-editor-block-bar">
                      <span className="text-xs font-semibold text-rm-muted">{tr(blockLabel(b.type))}</span>
                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100">
                        <button className="px-1.5 hover:text-rm-blue" title={tr("Move up")} onClick={() => moveBlock(b.id, -1)} disabled={i === 0}>↑</button>
                        <button className="px-1.5 hover:text-rm-blue" title={tr("Move down")} onClick={() => moveBlock(b.id, 1)} disabled={i === blocks.length - 1}>↓</button>
                        <button className="px-1.5 hover:text-rm-red" title={tr("Remove")} onClick={() => removeBlock(b.id)}>×</button>
                      </div>
                    </div>
                    <div className="p-3">
                      <BlockEdit block={b} onChange={(attrs) => updateBlock(b.id, attrs)} openPicker={setPicker}/>
                    </div>
                  </div>))}
              </div>

              <div className="mt-4 relative">
                <button className="rm-btn rm-btn-secondary" onClick={() => setInserterOpen((o) => !o)}>{tr("+ Add block")}</button>
                {inserterOpen && (<div className="noma-popover absolute z-10 mt-2 w-72 max-w-[calc(100vw-80px)] rm-admin-card p-3 grid grid-cols-3 gap-2">
                    {BLOCK_DEFS.map((d) => (<button key={d.type} onClick={() => addBlock(d.type)} className="flex flex-col items-center gap-1 p-2 rounded hover:bg-rm-gray text-xs">
                        <span className="text-lg text-rm-blue">{d.icon}</span>
                        {tr(d.label)}
                      </button>))}
                  </div>)}
              </div>
            </div>)}
        </div>

        <div className="noma-editor-inspector space-y-4">
          <div className="rm-admin-card p-4 space-y-3">
            <h3 className="font-semibold text-sm text-rm-dark">{tr("Status &amp; visibility")}</h3>
            <label className="block text-xs text-rm-muted">{tr("Status")}<select className="rm-input mt-1" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="draft">{tr("Draft")}</option>
                <option value="pending">{tr("Pending Review")}</option>
                <option value="publish">{tr("Published")}</option>
                <option value="future">{tr("Scheduled")}</option>
                <option value="private">{tr("Private")}</option>
              </select>
            </label>
            {status === "future" && (<label className="block text-xs text-rm-muted">{tr("Publish at")}<input type="datetime-local" className="rm-input mt-1" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}/></label>)}
            {type === "post" && (<label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={sticky} onChange={(e) => setSticky(e.target.checked)}/> {tr("Stick to top")}</label>)}
            <label className="block text-xs text-rm-muted">{tr("Slug")}<input className="rm-input mt-1" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={tr("auto-generated")}/>
            </label>
          </div>

          <div className="rm-admin-card p-4 space-y-2">
            <h3 className="font-semibold text-sm text-rm-dark">{tr("Excerpt")}</h3>
            <textarea className="rm-input min-h-[70px]" value={excerpt} onChange={(e) => setExcerpt(e.target.value)}/>
          </div>

          <div className="rm-admin-card p-4 space-y-3">
            <h3 className="font-semibold text-sm text-rm-dark">{tr("Search engine optimization")}</h3>
            <label className="block text-xs text-rm-muted">
              {tr("SEO title")}
              <input className="rm-input mt-1" value={seoTitle} maxLength={70} placeholder={title || tr("Uses the post title")} onChange={(e) => setSeoTitle(e.target.value)}/>
              <span className="text-[11px] text-rm-muted">{seoTitle.length}/70</span>
            </label>
            <label className="block text-xs text-rm-muted">
              {tr("Meta description")}
              <textarea className="rm-input mt-1 min-h-[64px]" value={seoDescription} maxLength={160} placeholder={excerpt || tr("Uses the excerpt or first paragraphs")} onChange={(e) => setSeoDescription(e.target.value)}/>
              <span className="text-[11px] text-rm-muted">{seoDescription.length}/160</span>
            </label>
            <label className="block text-xs text-rm-muted">
              {tr("Canonical URL")}
              <input className="rm-input mt-1" dir="ltr" value={seoCanonical} placeholder={savedId ? `/read/${slug}` : tr("auto")} onChange={(e) => setSeoCanonical(e.target.value)}/>
            </label>
            <div>
              <div className="text-xs text-rm-muted mb-1">{tr("Social share image")}</div>
              {seoImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={seoImage} alt="" className="w-full h-24 object-cover rounded border border-rm-border mb-2"/>) : null}
              <div className="flex gap-2">
                <button className="rm-btn rm-btn-secondary" onClick={() => setPicker({ kind: "seoimage" })}>{seoImage ? tr("Replace") : tr("Choose image")}</button>
                {seoImage && <button className="rm-btn rm-btn-ghost" onClick={() => setSeoImage("")}>{tr("Remove")}</button>}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={seoNoindex} onChange={(e) => setSeoNoindex(e.target.checked)}/> {tr("Hide from search engines (noindex)")}
            </label>
          </div>

          {type === "post" && (<>
              <div className="rm-admin-card p-4 space-y-2">
                <h3 className="font-semibold text-sm text-rm-dark">{tr("Categories")}</h3>
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {categories.map((c) => (<label key={c.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={categoryIds.includes(c.id)} onChange={() => setCategoryIds((p) => toggle(p, c.id))}/> {c.name}
                    </label>))}
                </div>
                <div className="flex gap-1">
                  <input className="rm-input" placeholder={tr("New category")} value={newCat} onChange={(e) => setNewCat(e.target.value)}/>
                  <button className="rm-btn rm-btn-ghost" onClick={() => addTerm("category")}>{tr("Add")}</button>
                </div>
              </div>

              <div className="rm-admin-card p-4 space-y-2">
                <h3 className="font-semibold text-sm text-rm-dark">{tr("Tags")}</h3>
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {tags.map((t) => (<label key={t.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={tagIds.includes(t.id)} onChange={() => setTagIds((p) => toggle(p, t.id))}/> {t.name}
                    </label>))}
                </div>
                <div className="flex gap-1">
                  <input className="rm-input" placeholder={tr("New tag")} value={newTag} onChange={(e) => setNewTag(e.target.value)}/>
                  <button className="rm-btn rm-btn-ghost" onClick={() => addTerm("tag")}>{tr("Add")}</button>
                </div>
              </div>

              <div className="rm-admin-card p-4 space-y-2">
                <h3 className="font-semibold text-sm text-rm-dark">{tr("Featured image")}</h3>
                {featured ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={featured.url} alt="" className="w-full h-28 object-cover rounded border border-rm-border"/>) : null}
                <button className="rm-btn rm-btn-secondary" onClick={() => setPicker({ kind: "featured" })}>{featured ? tr("Replace") : tr("Set featured image")}</button>
                {featured && <button className="rm-btn rm-btn-ghost" onClick={() => setFeatured(null)}>{tr("Remove")}</button>}
              </div>

              <div className="rm-admin-card p-4 space-y-2">
                <h3 className="font-semibold text-sm text-rm-dark">{tr("Discussion")}</h3>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={commentStatus === "open"} onChange={(e) => setCommentStatus(e.target.checked ? "open" : "closed")}/> {tr("Allow comments")}</label>
              </div>
            </>)}
        </div>
      </div>

      <MediaPicker open={!!picker} onClose={() => setPicker(null)} onSelect={onPick}/>
    </div>);
}
