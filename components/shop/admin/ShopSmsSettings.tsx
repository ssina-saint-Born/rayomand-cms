"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { ErrorNote, L, OkNote, Toggle, ShopHeader } from "./shared";

export interface SmsSettingsBundle {
    settings: Record<string, any>;
    gateways: { id: string; name: string }[];
    buyerStatuses: { value: string; label: string }[];
    adminStatuses: { value: string; label: string }[];
    shortcodes: Record<string, Record<string, string>>;
    events: Record<string, string>;
}

export function useSmsBundle() {
    const [bundle, setBundle] = useState<SmsSettingsBundle | null>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        api<SmsSettingsBundle>("/api/commerce/sms/settings").then(setBundle).catch((e) => setError(e.message));
    }, []);
    return { bundle, setBundle, error, setError };
}

export function MultiCheck({ options, value, onChange }: {
    options: { value: string; label: string }[];
    value: string[];
    onChange: (v: string[]) => void;
}) {
    const { t: tr } = useI18n();
    const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    return (<div className="grid sm:grid-cols-2 gap-1.5">
      {options.map((o) => (<label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)}/> {tr(o.label)}
        </label>))}
    </div>);
}

// The plugin stores multicheck values either as an array or a keyed object.
export function statusList(v: unknown): string[] {
    if (Array.isArray(v))
        return v.map(String);
    if (v && typeof v === "object")
        return Object.keys(v as Record<string, unknown>).filter((k) => (v as any)[k]);
    if (typeof v === "string" && v)
        return v.split(",").map((s) => s.trim()).filter(Boolean);
    return [];
}

function ShortcodeHelp({ groups }: {
    groups: Record<string, Record<string, string>>;
}) {
    const { t: tr } = useI18n();
    return (<details className="rm-admin-card p-4">
      <summary className="cursor-pointer text-sm font-semibold text-rm-dark">{tr("Available shortcodes")}</summary>
      <div className="mt-3 space-y-3">
        {Object.entries(groups).map(([group, tags]) => (<div key={group}>
            <p className="text-xs font-bold text-rm-muted uppercase tracking-wide mb-1">{tr(group.replace(/_/g, " "))}</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(tags).map(([code, label]) => (<span key={code} className="inline-flex items-center gap-1 rounded bg-rm-gray px-2 py-1 text-xs" title={tr(label)}>
                  <code className="font-mono text-rm-dark" dir="ltr">{code}</code>
                </span>))}
            </div>
          </div>))}
      </div>
    </details>);
}

const SECTION_TABS = [
    { id: "gateway", label: "Webservice" },
    { id: "super", label: "Super admin" },
    { id: "buyer", label: "Customer" },
    { id: "product", label: "Product manager" },
    { id: "newsletter", label: "Product newsletter" },
] as const;

export default function ShopSmsSettings() {
    const { t: tr } = useI18n();
    const { bundle, setBundle, error, setError } = useSmsBundle();
    const [tab, setTab] = useState<string>("gateway");
    const [msg, setMsg] = useState("");
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);

    if (!bundle)
        return error ? <ErrorNote error={error}/> : <Spinner label={tr("Loading SMS settings…")}/>;

    const s = bundle.settings;
    const set = (k: string, v: any) => {
        setDirty(true);
        setBundle((b: any) => ({ ...b, settings: { ...b.settings, [k]: v } }));
    };
    const bodyField = (key: string, label: string, hint?: string) => (<L key={key} label={label} hint={hint}>
      <textarea className="rm-input mt-1 font-mono text-xs" rows={5} dir="auto" value={String(s[key] ?? "")} onChange={(e) => set(key, e.target.value)}/>
    </L>);

    async function save() {
        setBusy(true);
        setError("");
        setMsg("");
        try {
            const next = await api<any>("/api/commerce/sms/settings", { method: "POST", body: JSON.stringify(s) });
            setBundle((b: any) => ({ ...b, settings: next.settings }));
            setDirty(false);
            setMsg("SMS settings saved.");
        }
        catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }

    const buyer = bundle.buyerStatuses;
    const admin = bundle.adminStatuses;
    return (<div className="space-y-4">
      <ShopHeader title={tr("SMS notifications")} sub={tr("Gateways, per-status message texts, manager alerts and the product newsletter.")}/>
      <ErrorNote error={error}/>
      <OkNote msg={msg}/>

      <div className="rm-admin-card">
        <div className="noma-tab-strip" aria-label={tr("SMS settings sections")}>
          {SECTION_TABS.map((t) => (<button key={t.id} className="noma-tab" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{tr(t.label)}</button>))}
        </div>
        <div className="p-5 max-w-3xl space-y-4">
          {tab === "gateway" && (<>
              <L label={tr("SMS gateway")} hint={tr("“Test gateway (log only)” writes messages to a local log instead of sending them, so you can walk through every flow safely.")}>
                <select className="rm-input mt-1" value={String(s.sms_gateway ?? "logger")} onChange={(e) => set("sms_gateway", e.target.value)}>
                  <option value="none">{tr("— Disabled —")}</option>
                  {bundle.gateways.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </L>
              <div className="grid sm:grid-cols-2 gap-3">
                <L label={tr("Username")}><input className="rm-input mt-1" dir="ltr" value={String(s.sms_gateway_username ?? "")} onChange={(e) => set("sms_gateway_username", e.target.value)}/></L>
                <L label={tr("Password / API key")}><input className="rm-input mt-1" dir="ltr" type="password" value={String(s.sms_gateway_password ?? "")} onChange={(e) => set("sms_gateway_password", e.target.value)}/></L>
              </div>
              <L label={tr("Sender number")}><input className="rm-input mt-1" dir="ltr" value={String(s.sms_gateway_sender ?? "")} onChange={(e) => set("sms_gateway_sender", e.target.value)}/></L>
              <Toggle checked={!!s.enable_admin_bar} onChange={(v) => set("enable_admin_bar", v ? 1 : 0)} label="Show a test-send bar to administrators"/>
              <div className="grid sm:grid-cols-2 gap-3 border-t border-rm-border pt-4">
                <L label={tr("Custom gateway URL")} hint={tr("Only used by the custom HTTP gateway.")}><input className="rm-input mt-1" dir="ltr" value={String(s.sms_gateway_custom_url ?? "")} onChange={(e) => set("sms_gateway_custom_url", e.target.value)}/></L>
                <L label={tr("Custom gateway method")}>
                  <select className="rm-input mt-1" value={String(s.sms_gateway_custom_method || "POST")} onChange={(e) => set("sms_gateway_custom_method", e.target.value)}>
                    <option value="POST">POST</option><option value="GET">GET</option>
                  </select>
                </L>
              </div>
              <L label={tr("Custom gateway headers")} hint={tr("One `Header: value` per line.")}>
                <textarea className="rm-input mt-1 font-mono text-xs" rows={3} dir="ltr" value={String(s.sms_gateway_custom_headers ?? "")} onChange={(e) => set("sms_gateway_custom_headers", e.target.value)}/>
              </L>
              <L label={tr("Custom gateway body")} hint={tr("Placeholders: {mobile}, {message}, {sender}.")}>
                <textarea className="rm-input mt-1 font-mono text-xs" rows={3} dir="ltr" value={String(s.sms_gateway_custom_body ?? "")} onChange={(e) => set("sms_gateway_custom_body", e.target.value)}/>
              </L>
            </>)}

          {tab === "super" && (<>
              <L label={tr("Super admin mobiles")} hint={tr("Comma-separated. These numbers receive the manager notifications below.")}>
                <input className="rm-input mt-1" dir="ltr" value={Array.isArray(s.super_admin_phone) ? s.super_admin_phone.join(",") : String(s.super_admin_phone ?? "")} onChange={(e) => set("super_admin_phone", e.target.value)}/>
              </L>
              <L label={tr("Bot recipients")} hint={tr("Up to five bot UUIDs, one per line (Telegram / Bale).")}>
                <textarea className="rm-input mt-1 font-mono text-xs" rows={3} dir="ltr" value={String(s.super_admin_bots ?? "")} onChange={(e) => set("super_admin_bots", e.target.value)}/>
              </L>
              <L label={tr("Notify super admin on these statuses")}>
                <div className="mt-1"><MultiCheck options={admin} value={statusList(s.super_admin_order_status)} onChange={(v) => set("super_admin_order_status", v)}/></div>
              </L>
              <div className="border-t border-rm-border pt-4 space-y-3">
                <p className="text-xs font-bold text-rm-muted uppercase tracking-wide">{tr("Message text per status")}</p>
                {buyer.map((b) => bodyField(`super_admin_sms_body_${b.value}`, tr(b.label)))}
              </div>
              <div className="border-t border-rm-border pt-4 space-y-3">
                <p className="text-xs font-bold text-rm-muted uppercase tracking-wide">{tr("Stock alerts to managers")}</p>
                {bodyField("admin_low_stock", tr("Low stock alert"))}
                {bodyField("admin_out_stock", tr("Out of stock alert"))}
                <L label={tr("Low stock threshold")} hint={tr("A product counts as low stock when its quantity is at or below this number.")}>
                  <input className="rm-input mt-1 !w-32" type="number" min="1" value={Number(s.stock_low_amount ?? 2)} onChange={(e) => set("stock_low_amount", Number(e.target.value))}/>
                </L>
              </div>
            </>)}

          {tab === "buyer" && (<>
              <Toggle checked={!!s.enable_metabox} onChange={(v) => set("enable_metabox", v ? 1 : 0)} label="Show the SMS opt-in checkbox on the order screen"/>
              <L label={tr("Opt-in checkbox text")}>
                <input className="rm-input mt-1" dir="auto" value={String(s.buyer_checkbox_text ?? "")} onChange={(e) => set("buyer_checkbox_text", e.target.value)}/>
              </L>
              <L label={tr("Send customer SMS for these statuses")}>
                <div className="mt-1"><MultiCheck options={buyer} value={statusList(s.order_status)} onChange={(v) => set("order_status", v)}/></div>
              </L>
              <div className="border-t border-rm-border pt-4 space-y-3">
                <p className="text-xs font-bold text-rm-muted uppercase tracking-wide">{tr("Message text per status")}</p>
                {buyer.map((b) => bodyField(`sms_body_${b.value}`, tr(b.label)))}
              </div>
              <p className="text-xs text-rm-muted">{tr("Customers only receive texts when they tick the opt-in box at checkout.")}</p>
            </>)}

          {tab === "product" && (<>
              <L label={tr("Product manager mobiles (user meta)")} hint={tr("Meta key read from the product author's user profile.")}>
                <input className="rm-input mt-1" dir="ltr" value={String(s.product_admin_user_meta ?? "")} onChange={(e) => set("product_admin_user_meta", e.target.value)}/>
              </L>
              <L label={tr("Product manager mobiles (post meta)")} hint={tr("Meta key read from the product itself.")}>
                <input className="rm-input mt-1" dir="ltr" value={String(s.product_admin_post_meta ?? "")} onChange={(e) => set("product_admin_post_meta", e.target.value)}/>
              </L>
              <Toggle checked={!!s.product_admin_dokan_integration} onChange={(v) => set("product_admin_dokan_integration", v ? 1 : 0)} label="Use the Dokan vendor phone number"/>
              <p className="text-xs text-rm-muted">{tr("Dokan stores vendor phones in its own vendor table. This store keeps manager mobiles on each product’s SMS tab, so they are used as the vendor contact even when the Dokan integration is on.")}</p>
              <L label={tr("Notify product managers on these statuses")}>
                <div className="mt-1"><MultiCheck options={buyer} value={statusList(s.product_admin_meta_order_status)} onChange={(v) => set("product_admin_meta_order_status", v)}/></div>
              </L>
              <div className="border-t border-rm-border pt-4 space-y-3">
                <p className="text-xs font-bold text-rm-muted uppercase tracking-wide">{tr("Message text per status")}</p>
                {buyer.map((b) => bodyField(`product_admin_sms_body_${b.value}`, tr(b.label), b.value === "created" ? tr("Vendor shortcodes such as {vendor_items} are replaced per manager.") : undefined))}
              </div>
            </>)}

          {tab === "newsletter" && (<>
              <Toggle checked={!!s.enable_notif_sms_main} onChange={(v) => set("enable_notif_sms_main", v ? 1 : 0)} label="Enable the product newsletter"/>
              <L label={tr("Where the subscribe form appears")}>
                <select className="rm-input mt-1" value={String(s.enable_notif_sms ?? "no")} onChange={(e) => set("enable_notif_sms", e.target.value)}>
                  <option value="on">{tr("On the product page")}</option>
                  <option value="thumbnail">{tr("Under the product image")}</option>
                  <option value="no">{tr("Do not show it")}</option>
                </select>
              </L>
              <L label={tr("Form title")}><input className="rm-input mt-1" dir="auto" value={String(s.notif_title ?? "")} onChange={(e) => set("notif_title", e.target.value)}/></L>
              <Toggle checked={!!s.notif_only_loggedin} onChange={(v) => set("notif_only_loggedin", v ? 1 : 0)} label="Only signed-in customers can subscribe"/>
              <L label={tr("Message for guests")}><input className="rm-input mt-1" dir="auto" value={String(s.notif_only_loggedin_text ?? "")} onChange={(e) => set("notif_only_loggedin_text", e.target.value)}/></L>
              <L label={tr("Custom notification groups")} hint={tr("One `code: label` per line. The codes must be numbers, e.g. 1 and 2.")}>
                <textarea className="rm-input mt-1 font-mono text-xs" rows={4} dir="auto" value={String(s.notif_options ?? "")} onChange={(e) => set("notif_options", e.target.value)}/>
              </L>

              <div className="border-t border-rm-border pt-4 space-y-3">
                <Toggle checked={!!s.enable_onsale} onChange={(v) => set("enable_onsale", v ? 1 : 0)} label="Send when a product goes on sale"/>
                <L label={tr("Group label")}><input className="rm-input mt-1" dir="auto" value={String(s.notif_onsale_text ?? "")} onChange={(e) => set("notif_onsale_text", e.target.value)}/></L>
                {bodyField("notif_onsale_sms", tr("On-sale message"))}
                <Toggle checked={!!s.notif_onsale_remove_contacts} onChange={(v) => set("notif_onsale_remove_contacts", v ? 1 : 0)} label="Remove subscribers after this text is sent"/>
              </div>
              <div className="border-t border-rm-border pt-4 space-y-3">
                <Toggle checked={!!s.enable_notif_no_stock} onChange={(v) => set("enable_notif_no_stock", v ? 1 : 0)} label="Send when an out-of-stock product is back in stock"/>
                <L label={tr("Group label")}><input className="rm-input mt-1" dir="auto" value={String(s.notif_no_stock_text ?? "")} onChange={(e) => set("notif_no_stock_text", e.target.value)}/></L>
                {bodyField("notif_no_stock_sms", tr("Back-in-stock message"))}
                <Toggle checked={!!s.notif_no_stock_remove_contacts} onChange={(v) => set("notif_no_stock_remove_contacts", v ? 1 : 0)} label="Remove subscribers after this text is sent"/>
              </div>
              <div className="border-t border-rm-border pt-4 space-y-3">
                <Toggle checked={!!s.enable_notif_low_stock} onChange={(v) => set("enable_notif_low_stock", v ? 1 : 0)} label="Send when a product is running low"/>
                <L label={tr("Group label")}><input className="rm-input mt-1" dir="auto" value={String(s.notif_low_stock_text ?? "")} onChange={(e) => set("notif_low_stock_text", e.target.value)}/></L>
                {bodyField("notif_low_stock_sms", tr("Low-stock message"))}
                <Toggle checked={!!s.notif_low_stock_remove_contacts} onChange={(v) => set("notif_low_stock_remove_contacts", v ? 1 : 0)} label="Remove subscribers after this text is sent"/>
              </div>
            </>)}

          <div className="pt-3 border-t border-rm-border flex items-center gap-3">
            <button className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }} disabled={busy || !dirty} onClick={save}>
              {busy ? tr("Saving…") : tr("Save changes")}
            </button>
            {dirty && <span className="text-xs text-rm-muted">{tr("Unsaved changes")}</span>}
          </div>
        </div>
      </div>

      <ShortcodeHelp groups={bundle.shortcodes}/>
    </div>);
}
