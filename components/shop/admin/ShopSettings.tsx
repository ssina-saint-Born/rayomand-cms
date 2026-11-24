"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { ErrorNote, L, OkNote, Toggle, ShopHeader } from "./shared";
type Field = {
    key: string;
    label: string;
    type: "text" | "number";
    hint?: string;
    step?: string;
} | {
    key: string;
    label: string;
    type: "select";
    options: [
        string,
        string
    ][];
    hint?: string;
} | {
    key: string;
    label: string;
    type: "toggle";
    hint?: string;
};
const TABS: {
    id: string;
    label: string;
    fields: Field[];
}[] = [
    {
        id: "general", label: "General", fields: [
            { key: "currency", label: "Currency", type: "select", options: [["USD", "US dollars ($)"], ["EUR", "Euro (€)"], ["GBP", "Pound sterling (£)"], ["JPY", "Japanese yen (¥)"], ["AUD", "Australian dollars (A$)"], ["CAD", "Canadian dollars (C$)"], ["INR", "Indian rupee (₹)"]] },
            { key: "currency_pos", label: "Currency position", type: "select", options: [["left", "Left ($99)"], ["right", "Right (99$)"], ["left_space", "Left with space ($ 99)"], ["right_space", "Right with space (99 $)"]] },
            { key: "thousand_sep", label: "Thousand separator", type: "text" },
            { key: "decimal_sep", label: "Decimal separator", type: "text" },
            { key: "num_decimals", label: "Number of decimals", type: "number" },
        ],
    },
    {
        id: "products", label: "Products", fields: [
            { key: "enable_reviews", label: "Enable product reviews", type: "toggle" },
            { key: "review_rating_required", label: "Star rating required on reviews", type: "toggle" },
            { key: "shop_columns", label: "Shop grid columns", type: "number", hint: "Used by the storefront product grid." },
            { key: "weight_unit", label: "Weight unit", type: "select", options: [["kg", "kg"], ["g", "g"], ["lbs", "lbs"], ["oz", "oz"]] },
            { key: "dimension_unit", label: "Dimension unit", type: "select", options: [["cm", "cm"], ["m", "m"], ["mm", "mm"], ["in", "in"], ["yd", "yd"]] },
        ],
    },
    {
        id: "shipping", label: "Shipping", fields: [
            { key: "shipping_flat_cost", label: "Flat rate cost", type: "number", step: "0.01" },
            { key: "shipping_free_min", label: "Free shipping minimum order", type: "number", step: "0.01", hint: "0 disables the free-shipping threshold." },
            { key: "shipping_pickup", label: "Offer local pickup (free)", type: "toggle" },
        ],
    },
    {
        id: "tax", label: "Tax", fields: [
            { key: "calc_taxes", label: "Enable tax calculations", type: "toggle" },
            { key: "tax_rate", label: "Standard rate (%)", type: "number", step: "0.01" },
            { key: "prices_include_tax", label: "Prices entered include tax", type: "toggle" },
        ],
    },
    {
        id: "checkout", label: "Checkout & downloads", fields: [
            { key: "payment_cod_enabled", label: "Accept cash on delivery", type: "toggle", hint: "Orders remain unpaid until you confirm payment. No simulated online payments are offered." },
            { key: "payment_bacs_enabled", label: "Accept bank transfers", type: "toggle" },
            { key: "payment_bacs_instructions", label: "Actual bank transfer instructions", type: "text", hint: "Required before this method appears at checkout." },
            { key: "payment_cheque_enabled", label: "Accept checks", type: "toggle" },
            { key: "payment_cheque_instructions", label: "Actual check payment instructions", type: "text" },
            { key: "enable_guest_checkout", label: "Allow guest checkout", type: "toggle" },
            { key: "enable_coupons", label: "Enable coupon codes", type: "toggle" },
            { key: "enable_downloads", label: "Enable free downloads (add-on master switch)", type: "toggle", hint: "Turns the Free Downloads add-on on or off store-wide." },
        ],
    },
];
export default function ShopSettings() {
    const { t: tr } = useI18n();
    const [settings, setSettings] = useState<any>(null);
    const [tab, setTab] = useState("general");
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        api<any>("/api/commerce/settings").then(setSettings).catch((e) => setError(e.message));
    }, []);
    const set = (k: string, v: any) => setSettings((s: any) => ({ ...s, [k]: v }));
    async function save() {
        setBusy(true);
        setError("");
        setMsg("");
        try {
            const next = await api<any>("/api/commerce/settings", { method: "POST", body: JSON.stringify(settings) });
            setSettings(next);
            setMsg("Settings saved.");
        }
        catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }
    if (!settings)
        return error ? <ErrorNote error={error}/> : <Spinner label={tr("Loading settings…")}/>;
    const active = TABS.find((t) => t.id === tab)!;
    return (<div>
      <ShopHeader title={tr("Commerce settings")} sub={tr("Store-wide commerce configuration")}/>
      <ErrorNote error={error}/>
      <OkNote msg={msg}/>
      <div className="rm-admin-card">
        <div className="noma-tab-strip" aria-label={tr("Commerce settings sections")}>
          {TABS.map((t) => (<button key={t.id} onClick={() => setTab(t.id)} className="noma-tab" aria-pressed={tab === t.id}>
              {tr(t.label)}
            </button>))}
        </div>
        <div className="p-5 max-w-2xl space-y-4">
          {active.fields.map((f) => {
            if (f.type === "toggle") {
                return (<div key={f.key}>
                  <Toggle checked={!!settings[f.key]} onChange={(v) => set(f.key, v ? 1 : 0)} label={f.label}/>
                  {f.hint && <p className="text-xs text-rm-muted ms-6 mt-0.5">{tr(f.hint)}</p>}
                </div>);
            }
            if (f.type === "select") {
                return (<L key={f.key} label={f.label} hint={f.hint}>
                  <select className="rm-input mt-1" value={settings[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                    {f.options.map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
                  </select>
                </L>);
            }
            return (<L key={f.key} label={f.label} hint={f.hint}>
                <input className="rm-input mt-1" type={f.type} step={f.type === "number" ? f.step || "1" : undefined} value={settings[f.key]} onChange={(e) => set(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)}/>
              </L>);
        })}
          <div className="pt-3 border-t border-rm-border">
            <button className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }} disabled={busy} onClick={save}>
              {busy ? tr("Saving…") : tr("Save changes")}
            </button>
          </div>
        </div>
      </div>
    </div>);
}
