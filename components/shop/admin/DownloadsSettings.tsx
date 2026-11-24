"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { ErrorNote, L, OkNote, Toggle, ShopHeader } from "./shared";
type Field = {
    key: string;
    label: string;
    type: "text" | "textarea" | "number" | "select" | "toggle" | "color";
    options?: [
        string | number,
        string
    ][];
    hint?: string;
};
const FREQS: [
    string,
    string
][] = [["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"], ["all", "Lifetime"]];
const TABS: {
    id: string;
    label: string;
    fields: Field[];
}[] = [
    {
        id: "general", label: "General", fields: [
            { key: "disable_ecommerce", label: "Disable eCommerce", type: "toggle", hint: "Hide cart & checkout; free products download straight from their pages." },
            { key: "require_login", label: "Require login to download", type: "toggle" },
            { key: "require_login_message", label: "Login required message", type: "text" },
            { key: "require_login_grouped_message", label: "Login required message (grouped products)", type: "text" },
            { key: "include_sale_items", label: "Include products on sale", type: "toggle", hint: "Treat discounted-to-zero products as free downloads too." },
            { key: "include_archive_items", label: "Show download buttons in the shop grid", type: "toggle" },
            { key: "hide_readmore", label: "Hide “Read more” for free products in the grid", type: "toggle" },
            { key: "include_purchased", label: "Include purchased products in My Account downloads", type: "toggle" },
            { key: "owned_include", label: "Show owned badge on purchased free products", type: "toggle" },
            { key: "download_counts", label: "Display download counts", type: "toggle" },
            { key: "download_counts_output_text", label: "Count text", type: "text", hint: "Use {count} as the placeholder." },
            { key: "badge_text", label: "Free badge text", type: "text" },
            { key: "hide_badge", label: "Hide the free badge", type: "toggle" },
            { key: "button_text", label: "Download button text", type: "text" },
            { key: "link_text", label: "Per-file link text", type: "text" },
            { key: "display_single", label: "Single file display", type: "select", options: [["button", "Green button"], ["link", "Text link"]] },
            { key: "display_multi", label: "Multiple files display", type: "select", options: [["button_links", "Button + per-file links"], ["links", "Per-file links only"], ["filenames", "Button + file names"], ["checkboxes", "Checkboxes (customer picks files)"]] },
            { key: "show_filename", label: "Show file names to customers", type: "toggle" },
            { key: "file_list_text", label: "File list heading", type: "text" },
            { key: "checkbox_error_text", label: "Checkbox mode error (nothing selected)", type: "text" },
            { key: "force_zip", label: "Force ZIP for multi-file products", type: "toggle" },
            { key: "button_class", label: "Extra CSS classes for the button", type: "text" },
            { key: "link_class", label: "Extra CSS classes for links", type: "text" },
            { key: "docviewer_enable", label: "Offer inline PDF viewing", type: "toggle" },
            { key: "docviewer_single_link_text", label: "PDF viewer link text", type: "text" },
            { key: "download_history_enable", label: "Show download history in My Account", type: "toggle" },
            { key: "download_history_title", label: "History heading", type: "text" },
            { key: "download_history_message", label: "History description", type: "text" },
            { key: "download_history_hide_purchase", label: "Hide purchased items from history", type: "toggle" },
        ],
    },
    {
        id: "limits", label: "Download Limits", fields: [
            { key: "download_limits_active", label: "Enable download limits", type: "toggle", hint: "Priority: per-product override → role limit → global basic limit." },
            { key: "limit_heading", label: "Limits heading shown to customers", type: "text" },
            { key: "available_downloads_text", label: "Remaining downloads text", type: "text", hint: "Placeholders: {remaining}, {freq}, {amount}." },
            { key: "basic_limit_enable", label: "Enable global basic limit", type: "toggle" },
            { key: "basic_limit_amount", label: "Downloads allowed", type: "number" },
            { key: "basic_limit_freq", label: "Per period", type: "select", options: FREQS },
            { key: "basic_limit_error", label: "Limit reached message", type: "text" },
            { key: "basic_limit_error_redirect", label: "Redirect URL when limit reached", type: "text", hint: "Optional. Leave blank to show the message inline." },
        ],
    },
    {
        id: "types", label: "Download Types", fields: [
            { key: "download_type_option", label: "How files are delivered", type: "select", options: [[0, "Direct download"], [1, "Email a secure link"], [2, "Redirect to a download page"]], hint: "Per-product overrides win over this global choice." },
            { key: "email_subject", label: "Email subject", type: "text" },
            { key: "email_heading", label: "Email heading", type: "text" },
            { key: "email_message", label: "Email message", type: "textarea", hint: "The secure link is appended automatically." },
            { key: "email_sender_name", label: "Sender name", type: "text" },
            { key: "email_sender_address", label: "Sender address", type: "text" },
            { key: "email_expire_time", label: "Link expiry (hours)", type: "number" },
            { key: "email_used_message", label: "“Link already used” message", type: "text" },
            { key: "email_expire_message", label: "“Link expired” message", type: "text" },
            { key: "email_plain_text", label: "Send plain-text emails", type: "toggle" },
            { key: "redirect_page", label: "Redirect page path", type: "text", hint: "The token is appended as ?token=…" },
            { key: "redirect_text", label: "Redirect page heading", type: "text" },
            { key: "redirect_time", label: "Auto-download countdown (seconds)", type: "number" },
            { key: "redirect_expire_time", label: "Redirect link expiry (hours)", type: "number" },
        ],
    },
    {
        id: "capture", label: "Email Capture", fields: [
            { key: "capture_email_enable", label: "Capture email before downloading", type: "toggle" },
            { key: "capture_email_users_enable", label: "Also capture from logged-in users", type: "toggle" },
            { key: "exclude_email_capture", label: "Disable capture for all products", type: "toggle", hint: "Master off-switch; per-product exclusions live on the product editor." },
            { key: "capture_email_title", label: "Modal title", type: "text" },
            { key: "capture_email_title_bg", label: "Title bar background", type: "color" },
            { key: "capture_email_title_colour", label: "Title bar text colour", type: "color" },
            { key: "capture_email_body", label: "Modal body text", type: "textarea" },
            { key: "capture_email_placeholder", label: "Email placeholder", type: "text" },
            { key: "capture_email_button", label: "Submit button text", type: "text" },
            { key: "capture_email_subscribe", label: "Subscribe captured emails to the newsletter", type: "toggle" },
            { key: "capture_email_error_none", label: "Error: empty email", type: "text" },
            { key: "capture_email_error_invalid", label: "Error: invalid email", type: "text" },
        ],
    },
    {
        id: "emails", label: "Admin Emails", fields: [
            { key: "email_new_download_enable", label: "Notify admin on every free download", type: "toggle" },
            { key: "email_new_download_sendto", label: "Send to", type: "text" },
            { key: "email_new_download_subject", label: "Subject", type: "text" },
            { key: "email_new_download_heading", label: "Heading", type: "text" },
            { key: "email_new_download_message", label: "Message", type: "textarea", hint: "Placeholders: {product}, {user}, {email}." },
            { key: "email_settings_sender_name", label: "Sender name", type: "text" },
            { key: "email_settings_sender_address", label: "Sender address", type: "text" },
            { key: "email_settings_content_type", label: "Content type", type: "select", options: [["html", "HTML"], ["plain", "Plain text"]] },
        ],
    },
    {
        id: "newsletter", label: "Newsletter", fields: [
            { key: "newsletter_enable", label: "Show newsletter signup in the shop", type: "toggle", hint: "Captured emails can also subscribe automatically (Email Capture tab)." },
        ],
    },
];
function Chips({ items, selected, onToggle }: {
    items: {
        id: number;
        name: string;
    }[];
    selected: any[];
    onToggle: (id: number) => void;
}) {
    const { t: tr } = useI18n();
    if (!items.length)
        return <p className="text-sm text-rm-muted">{tr("Nothing available yet.")}</p>;
    return (<div className="flex flex-wrap gap-2">
      {items.map((it) => {
            const on = selected.some((x) => String(x) === String(it.id));
            return (<button key={it.id} onClick={() => onToggle(it.id)} className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${on ? "text-white border-transparent" : "bg-white text-rm-text border-rm-border hover:border-[#656080]"}`} style={on ? { background: "#656080" } : undefined}>
            {it.name}
          </button>);
        })}
    </div>);
}
export default function DownloadsSettings() {
    const { t: tr } = useI18n();
    const [som, setSom] = useState<any>(null);
    const [tab, setTab] = useState("general");
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");
    const [busy, setBusy] = useState(false);
    const [cats, setCats] = useState<any[]>([]);
    const [tags, setTags] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    useEffect(() => {
        api<any>("/api/downloads/settings").then(setSom).catch((e) => setError(e.message));
        api<any>("/api/storefront/settings").then((s) => { setCats(s.categories || []); setTags(s.tags || []); }).catch(() => { });
        api<any>("/api/commerce/products?per_page=100&status=any").then((r) => setProducts(r.items.filter((p: any) => p.type !== "variation"))).catch(() => { });
    }, []);
    const set = (k: string, v: any) => setSom((s: any) => ({ ...s, [k]: v }));
    const toggleIn = (key: string, id: number) => {
        const list = som[key] || [];
        set(key, list.some((x: any) => String(x) === String(id)) ? list.filter((x: any) => String(x) !== String(id)) : [...list, id]);
    };
    const setRole = (role: string, k: string, v: any) => setSom((s: any) => ({ ...s, role_limits: { ...s.role_limits, [role]: { ...(s.role_limits?.[role] || {}), [k]: v } } }));
    async function save() {
        setBusy(true);
        setError("");
        setMsg("");
        try {
            const next = await api<any>("/api/downloads/settings", { method: "POST", body: JSON.stringify(som) });
            setSom(next);
            setMsg("Free Downloads settings saved.");
        }
        catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }
    if (!som)
        return error ? <ErrorNote error={error}/> : <Spinner label={tr("Loading add-on settings…")}/>;
    const active = TABS.find((t) => t.id === tab)!;
    return (<div>
      <ShopHeader title={tr("Free Downloads — Settings")} sub={tr("Digital delivery, email capture and download preferences")}/>
      <ErrorNote error={error}/>
      <OkNote msg={msg}/>
      <div className="rm-admin-card">
        <div className="noma-tab-strip" aria-label={tr("Download settings sections")}>
          {[...TABS, { id: "include", label: "Include / Exclude", fields: [] }].map((t) => (<button key={t.id} onClick={() => setTab(t.id)} className="noma-tab" aria-pressed={tab === t.id}>
              {tr(t.label)}
            </button>))}
        </div>

        <div className="p-5 max-w-3xl space-y-4">
          {tab !== "include" && active.fields.map((f) => {
            if (f.type === "toggle") {
                return (<div key={f.key}>
                  <Toggle checked={!!som[f.key]} onChange={(v) => set(f.key, v ? 1 : 0)} label={f.label}/>
                  {f.hint && <p className="text-xs text-rm-muted ms-6 mt-0.5">{tr(f.hint)}</p>}
                </div>);
            }
            if (f.type === "select") {
                return (<L key={f.key} label={f.label} hint={f.hint}>
                  <select className="rm-input mt-1" value={som[f.key]} onChange={(e) => set(f.key, f.options?.some(([v]) => typeof v === "number") ? Number(e.target.value) : e.target.value)}>
                    {f.options!.map(([v, l]) => <option key={String(v)} value={String(v)}>{tr(l)}</option>)}
                  </select>
                </L>);
            }
            if (f.type === "textarea") {
                return (<L key={f.key} label={f.label} hint={f.hint}>
                  <textarea className="rm-input mt-1" rows={3} value={som[f.key]} onChange={(e) => set(f.key, e.target.value)}/>
                </L>);
            }
            if (f.type === "color") {
                return (<L key={f.key} label={f.label} hint={f.hint}>
                  <span className="flex items-center gap-2 mt-1">
                    <input type="color" className="w-10 h-9 rounded border border-rm-border cursor-pointer" value={som[f.key]} onChange={(e) => set(f.key, e.target.value)}/>
                    <input className="rm-input !w-32 font-mono" value={som[f.key]} onChange={(e) => set(f.key, e.target.value)}/>
                  </span>
                </L>);
            }
            return (<L key={f.key} label={f.label} hint={f.hint}>
                <input className="rm-input mt-1" type={f.type} value={som[f.key]} onChange={(e) => set(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)}/>
              </L>);
        })}

          {tab === "limits" && (<div className="border-t border-rm-border pt-4 space-y-4">
              <h3 className="font-semibold text-sm text-rm-dark">{tr("Role limits")}</h3>
              <p className="text-xs text-rm-muted">{tr("Applied to logged-in users when no per-product override exists. Beats the global basic limit.")}</p>
              {["customer", "subscriber"].map((role) => {
                const rl = som.role_limits?.[role] || {};
                return (<div key={role} className="border border-rm-border rounded p-3 bg-rm-gray/40 space-y-2">
                    <Toggle checked={!!rl.enable} onChange={(v) => setRole(role, "enable", v)} label={tr("Limit {0}s", {"0": tr(role)})}/>
                    {rl.enable && (<div className="grid sm:grid-cols-3 gap-2">
                        <input className="rm-input" type="number" min="1" placeholder={tr("Amount")} value={rl.amount ?? 5} onChange={(e) => setRole(role, "amount", Number(e.target.value))}/>
                        <select className="rm-input" value={rl.freq || "month"} onChange={(e) => setRole(role, "freq", e.target.value)}>
                          {FREQS.map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
                        </select>
                        <input className="rm-input" placeholder={tr("Custom error (optional)")} value={rl.error || ""} onChange={(e) => setRole(role, "error", e.target.value)}/>
                      </div>)}
                  </div>);
            })}
            </div>)}

          {tab === "include" && (<>
              <p className="text-sm text-rm-muted">
                {tr("Leave all three “include” lists empty to offer every qualifying free product. Adding any entry restricts offers to matches only. Exclusions always win. Per-product overrides are on each product's")}<span className="font-semibold">{tr("Free Download")}</span> {tr("tab.")}</p>
              <div>
                <h3 className="font-semibold text-sm text-rm-dark mb-2">{tr("Include categories")}</h3>
                <Chips items={cats} selected={som.included_categories || []} onToggle={(id) => toggleIn("included_categories", id)}/>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-rm-dark mb-2">{tr("Include tags")}</h3>
                <Chips items={tags} selected={som.included_tags || []} onToggle={(id) => toggleIn("included_tags", id)}/>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-rm-dark mb-2">{tr("Include specific products")}</h3>
                <Chips items={products} selected={som.included_products || []} onToggle={(id) => toggleIn("included_products", id)}/>
              </div>
              <div className="border-t border-rm-border pt-4">
                <h3 className="font-semibold text-sm text-rm-dark mb-2">{tr("Exclude products entirely")}</h3>
                <Chips items={products} selected={som.indy_exclude_items || []} onToggle={(id) => toggleIn("indy_exclude_items", id)}/>
              </div>
            </>)}

          {tab === "emails" && (<p className="noma-notice bg-blue-50 text-rm-blue">
              {tr("Email requires actual SMTP configuration in the private environment file. Accepted, failed and unconfigured attempts are recorded under")}<Link href="/studio/downloads/emails" className="text-rm-blue font-semibold hover:underline">{tr("Free Downloads → Email Log")}</Link>.
            </p>)}
          {tab === "newsletter" && (<p className="text-sm text-rm-muted">{tr("Manage the list under")}{" "}<Link href="/studio/downloads/subscribers" className="text-rm-blue font-semibold hover:underline">{tr("Subscribers")}</Link>.</p>)}

          <div className="pt-3 border-t border-rm-border">
            <button className="rm-btn rm-btn-primary" style={{ background: "#4c6c57", borderColor: "#4c6c57" }} disabled={busy} onClick={save}>
              {busy ? tr("Saving…") : tr("Save changes")}
            </button>
          </div>
        </div>
      </div>
    </div>);
}
