"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import type { Post, Term } from "@/lib/types";
import { ROLES } from "@/lib/types";
import { api } from "@/lib/client";
import { PageHeader, Spinner, Notice } from "./ui";
const TABS = ["General", "Writing", "Reading", "Discussion", "Media", "Permalinks", "Privacy", "SEO"];
const FORMATS = ["standard", "aside", "gallery", "link", "image", "quote", "status", "video", "audio"];
export default function SettingsForm() {
    const { t: tr } = useI18n();
    const [tab, setTab] = useState("General");
    const [s, setS] = useState<Record<string, any>>({});
    const [pages, setPages] = useState<Post[]>([]);
    const [categories, setCategories] = useState<Term[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);
    useEffect(() => {
        (async () => {
            try {
                const [settings, p, c] = await Promise.all([
                    api<Record<string, any>>("/api/content/settings"),
                    api<{
                        items: Post[];
                    }>("/api/content/pages?status=any&per_page=100"),
                    api<Term[]>("/api/content/categories"),
                ]);
                setS(settings);
                setPages(p.items);
                setCategories(c);
            }
            catch (e: any) {
                setMsg({ type: "error", text: e.message });
            }
            setLoading(false);
        })();
    }, []);
    const set = (k: string, v: any) => setS((prev) => ({ ...prev, [k]: v }));
    async function save() {
        setBusy(true);
        setMsg(null);
        try {
            const updated = await api<Record<string, any>>("/api/content/settings", { method: "POST", body: JSON.stringify(s) });
            setS(updated);
            setMsg({ type: "success", text: "Settings saved." });
        }
        catch (e: any) {
            setMsg({ type: "error", text: e.message });
        }
        setBusy(false);
    }
    if (loading)
        return <Spinner />;
    const Field = ({ label, children }: {
        label: string;
        children: React.ReactNode;
    }) => (<div className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 border-b border-rm-gray">
      <div className="sm:w-56 text-sm font-semibold text-rm-dark">{label}</div>
      <div className="flex-1">{children}</div>
    </div>);
    return (<div>
      <PageHeader title={tr("Settings")}/>
      {msg && <Notice type={msg.type}>{msg.text}</Notice>}
      <div className="noma-tab-strip mb-4" aria-label={tr("Workspace settings sections")}>
        {TABS.map((t) => (<button key={t} onClick={() => setTab(t)} className="noma-tab" aria-pressed={tab === t}>{tr(t)}</button>))}
      </div>

      <div className="rm-admin-card p-5 max-w-3xl">
        {tab === "General" && (<div>
            <Field label={tr("Site Title")}><input className="rm-input" value={s.site_title || ""} onChange={(e) => set("site_title", e.target.value)}/></Field>
            <Field label={tr("Tagline")}><input className="rm-input" value={s.tagline || ""} onChange={(e) => set("tagline", e.target.value)}/></Field>
            <Field label={tr("Administration Email")}><input className="rm-input" value={s.admin_email || ""} onChange={(e) => set("admin_email", e.target.value)}/></Field>
            <Field label={tr("Timezone")}><input className="rm-input" value={s.timezone || ""} onChange={(e) => set("timezone", e.target.value)}/></Field>
            <Field label={tr("Date Format")}><input className="rm-input" value={s.date_format || ""} onChange={(e) => set("date_format", e.target.value)}/></Field>
            <Field label={tr("Time Format")}><input className="rm-input" value={s.time_format || ""} onChange={(e) => set("time_format", e.target.value)}/></Field>
            <Field label={tr("Membership")}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!s.users_can_register} onChange={(e) => set("users_can_register", e.target.checked)}/> {" "}{tr("Anyone can register")}</label></Field>
            <Field label={tr("New User Default Role")}>
              <select className="rm-input w-56" value={s.default_role || "subscriber"} onChange={(e) => set("default_role", e.target.value)}>
                {ROLES.map((r) => <option key={r.value} value={r.value}>{tr(r.label)}</option>)}
              </select>
            </Field>
          </div>)}

        {tab === "Writing" && (<div>
            <Field label={tr("Default Post Category")}>
              <select className="rm-input w-56" value={s.default_category || ""} onChange={(e) => set("default_category", e.target.value)}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label={tr("Default Post Format")}>
              <select className="rm-input w-56" value={s.default_post_format || "standard"} onChange={(e) => set("default_post_format", e.target.value)}>
                {FORMATS.map((f) => <option key={f} value={f}>{tr(f)}</option>)}
              </select>
            </Field>
          </div>)}

        {tab === "Reading" && (<div>
            <Field label={tr("Your homepage displays")}>
              <div className="space-y-1 text-sm">
                <label className="flex items-center gap-2"><input type="radio" checked={s.show_on_front === "posts"} onChange={() => set("show_on_front", "posts")}/> {" "}{tr("Your latest posts")}</label>
                <label className="flex items-center gap-2"><input type="radio" checked={s.show_on_front === "page"} onChange={() => set("show_on_front", "page")}/> {" "}{tr("A static page")}</label>
              </div>
            </Field>
            {s.show_on_front === "page" && (<>
                <Field label={tr("Homepage")}>
                  <select className="rm-input w-56" value={s.page_on_front || ""} onChange={(e) => set("page_on_front", e.target.value)}>
                    <option value="">{tr("— Select —")}</option>
                    {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </Field>
                <Field label={tr("Posts page")}>
                  <select className="rm-input w-56" value={s.page_for_posts || ""} onChange={(e) => set("page_for_posts", e.target.value)}>
                    <option value="">{tr("— Select —")}</option>
                    {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </Field>
              </>)}
            <Field label={tr("Blog pages show at most")}><input type="number" className="rm-input w-24" value={s.posts_per_page ?? 10} onChange={(e) => set("posts_per_page", Number(e.target.value))}/> <span className="text-sm text-rm-muted">{tr("posts")}</span></Field>
            <Field label={tr("Search Engine Visibility")}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!s.blog_public} onChange={(e) => set("blog_public", !e.target.checked)}/> {" "}{tr("Discourage search engines from indexing this site")}</label></Field>
          </div>)}

        {tab === "Discussion" && (<div>
            <Field label={tr("Default comment status")}>
              <select className="rm-input w-56" value={s.default_comment_status || "open"} onChange={(e) => set("default_comment_status", e.target.value)}>
                <option value="open">{tr("Allow comments")}</option>
                <option value="closed">{tr("Do not allow comments")}</option>
              </select>
            </Field>
            <Field label={tr("Comment moderation")}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!s.comment_moderation} onChange={(e) => set("comment_moderation", e.target.checked)}/> {" "}{tr("Hold new comments for moderation")}</label></Field>
          </div>)}

        {tab === "Media" && (<div className="text-sm text-rm-muted space-y-2">
            <p>{tr("Uploaded files are stored locally in")}{" "}<code>public/uploads</code>.</p>
            <p>{tr("Maximum upload size:")}{" "}<strong>{tr("20 MB")}</strong>{tr(". Allowed types: PNG, JPEG, GIF, WebP, PDF, TXT, MP3, MP4, ZIP.")}</p>
            <p>{tr("Image thumbnail sizes are generated on demand by the browser in this clone.")}</p>
          </div>)}

        {tab === "Permalinks" && (<div className="space-y-2 text-sm">
            <p>{tr("Posts and pages use this address pattern.")}</p>
            <code dir="ltr" className="block text-rm-muted">/read/&#123;slug&#125;</code>
          </div>)}

        {tab === "Privacy" && (<div>
            <Field label={tr("Privacy Policy page")}>
              <select className="rm-input w-56" value={s.privacy_page_id || ""} onChange={(e) => set("privacy_page_id", e.target.value)}>
                <option value="">{tr("— Select —")}</option>
                {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </Field>
            <p className="text-xs text-rm-muted pt-3">{tr("Personal data export/erase tools are available under Tools.")}</p>
          </div>)}

        {tab === "SEO" && (<div>
            <Field label={tr("Site address")}>
              <input className="rm-input" dir="ltr" value={s.site_url || ""} placeholder="https://example.com" onChange={(e) => set("site_url", e.target.value)}/>
              <p className="text-xs text-rm-muted mt-1">{tr("Absolute URL used for canonical links, OpenGraph tags and the sitemap. Leave blank to use the request host.")}</p>
            </Field>
            <Field label={tr("Title separator")}>
              <input className="rm-input w-24" value={s.seo_title_separator || "·"} maxLength={3} onChange={(e) => set("seo_title_separator", e.target.value)}/>
            </Field>
            <Field label={tr("Default social image")}>
              <input className="rm-input" dir="ltr" value={s.default_og_image || ""} placeholder="/uploads/…" onChange={(e) => set("default_og_image", e.target.value)}/>
            </Field>
            <Field label={tr("Twitter / X handle")}>
              <input className="rm-input w-56" dir="ltr" value={s.twitter_site || ""} placeholder="@handle" onChange={(e) => set("twitter_site", e.target.value)}/>
            </Field>
            <Field label={tr("Organization name")}>
              <input className="rm-input" value={s.organization_name || ""} placeholder={s.site_title || ""} onChange={(e) => set("organization_name", e.target.value)}/>
            </Field>
            <Field label={tr("Organization logo")}>
              <input className="rm-input" dir="ltr" value={s.organization_logo || ""} placeholder="/uploads/…" onChange={(e) => set("organization_logo", e.target.value)}/>
            </Field>
            <Field label={tr("Social profiles")}>
              <textarea className="rm-input min-h-[70px]" dir="ltr" value={s.social_profiles || ""} placeholder={"https://…\nhttps://…"} onChange={(e) => set("social_profiles", e.target.value)}/>
              <p className="text-xs text-rm-muted mt-1">{tr("One URL per line. Used in Organization structured data (sameAs).")}</p>
            </Field>
            <Field label={tr("Google verification")}>
              <input className="rm-input" dir="ltr" value={s.search_verification_google || ""} onChange={(e) => set("search_verification_google", e.target.value)}/>
            </Field>
            <Field label={tr("Bing verification")}>
              <input className="rm-input" dir="ltr" value={s.search_verification_bing || ""} onChange={(e) => set("search_verification_bing", e.target.value)}/>
            </Field>
            <div className="py-3 border-b border-rm-gray text-sm">
              <p className="text-rm-muted">{tr("Sitemap:")}{" "}<code dir="ltr">{s.site_url ? `${s.site_url}/sitemap.xml` : "/sitemap.xml"}</code></p>
              <p className="text-rm-muted mt-1">{tr("Robots:")}{" "}<code dir="ltr">{s.site_url ? `${s.site_url}/robots.txt` : "/robots.txt"}</code></p>
            </div>
          </div>)}

        <div className="pt-4">
          <button className="rm-btn rm-btn-primary" disabled={busy} onClick={save}>{busy ? tr("Saving…") : tr("Save Changes")}</button>
        </div>
      </div>
    </div>);
}
