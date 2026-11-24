"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { L, OkNote, Toggle } from "./shared";
import { ErrorNote } from "./shared";
import { MultiCheck, useSmsBundle } from "./ShopSmsSettings";

interface ProductSmsData {
    enabled: boolean;
    values: Record<string, string>;
    overrides: Record<string, string>;
    admins: { mobile: string; statuses: string[] }[];
}

const TEXT_KEYS = [
    ["enable_onsale", "notif_onsale_text", "notif_onsale_sms"],
    ["enable_notif_no_stock", "notif_no_stock_text", "notif_no_stock_sms"],
    ["enable_notif_low_stock", "notif_low_stock_text", "notif_low_stock_sms"],
] as const;

// Product/Tab.php — the per-product SMS overrides and the manager list.
export default function ProductSmsTab({ productId }: {
    productId: number;
}) {
    const { t: tr } = useI18n();
    const { bundle } = useSmsBundle();
    const [data, setData] = useState<ProductSmsData | null>(null);
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");
    const [busy, setBusy] = useState(false);
    const [admins, setAdmins] = useState<{ mobile: string; statuses: string[] }[]>([]);
    const [groups, setGroups] = useState<Record<string, string>>({});
    const [manualGroup, setManualGroup] = useState("");
    const [manualMessage, setManualMessage] = useState("");
    const [manualBusy, setManualBusy] = useState(false);
    const [manualNote, setManualNote] = useState("");

    useEffect(() => {
        if (!productId)
            return;
        api<any>(`/api/commerce/products/${productId}/sms`)
            .then((d) => {
                setData(d);
                setAdmins(d.admins.length ? d.admins : [{ mobile: "", statuses: [] }]);
                setGroups(d.groups || {});
            })
            .catch((e) => setError(e.message));
    }, [productId]);

    if (!productId)
        return <p className="text-sm text-rm-muted">{tr("Save the product first to configure its SMS notifications.")}</p>;
    if (!data)
        return error ? <ErrorNote error={error}/> : null;

    const v = data.values;
    const set = (k: string, value: any) => setData((d: any) => ({ ...d, values: { ...d.values, [k]: value } }));
    const setAdmin = (i: number, patch: any) => setAdmins((rows) => rows.map((r, j) => j === i ? { ...r, ...patch } : r));

    async function save() {
        setBusy(true);
        setError("");
        setMsg("");
        try {
            const next = await api<ProductSmsData>(`/api/commerce/products/${productId}/sms`, {
                method: "PATCH",
                body: JSON.stringify({ ...v, admins: admins.filter((a) => a.mobile.trim()) }),
            });
            setData(next);
            setMsg(tr("Product SMS settings saved."));
        }
        catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }

    async function sendManual() {
        setManualBusy(true);
        setManualNote("");
        setError("");
        try {
            const r = await api<any>(`/api/commerce/products/${productId}/sms`, {
                method: "POST",
                body: JSON.stringify({ group: manualGroup, message: manualMessage }),
            });
            setManualNote(tr("Sent to {0} subscriber(s).", { "0": String(r.sent ?? 0) }));
            setManualMessage("");
        }
        catch (e: any) {
            setError(e.message);
        }
        setManualBusy(false);
    }

    return (<div className="space-y-4">
      <ErrorNote error={error}/>
      <OkNote msg={msg}/>
      <p className="text-xs text-rm-muted">
        {data.enabled
            ? tr("These fields override the store-wide newsletter texts for this product. Leave a field matching the global text to inherit it.")
            : tr("The product newsletter is disabled store-wide. Turn it on in Commerce → SMS → Settings to use these options.")}
      </p>

      <L label={tr("Newsletter form appearance")}>
        <select className="rm-input mt-1" value={String(v.enable_notif_sms || "no")} onChange={(e) => set("enable_notif_sms", e.target.value)}>
          <option value="no">{tr("Use the store setting")}</option>
          <option value="on">{tr("On the product page")}</option>
          <option value="thumbnail">{tr("Under the product image")}</option>
        </select>
      </L>
      <L label={tr("Form title")}><input className="rm-input mt-1" dir="auto" value={String(v.notif_title ?? "")} onChange={(e) => set("notif_title", e.target.value)}/></L>
      <Toggle checked={!!Number(v.notif_only_loggedin) || v.notif_only_loggedin === "1"} onChange={(x) => set("notif_only_loggedin", x ? "1" : "")} label="Only signed-in customers can subscribe"/>
      <L label={tr("Message for guests")}><input className="rm-input mt-1" dir="auto" value={String(v.notif_only_loggedin_text ?? "")} onChange={(e) => set("notif_only_loggedin_text", e.target.value)}/></L>

      <div className="border-t border-rm-border pt-4 space-y-3">
        <p className="text-xs font-bold text-rm-muted uppercase tracking-wide">{tr("Newsletter texts")}</p>
        {TEXT_KEYS.map(([flag, label, sms]) => (<div key={flag} className="space-y-2 rounded border border-rm-border p-3">
            <Toggle checked={!!Number(v[flag]) || v[flag] === "1"} onChange={(x) => set(flag, x ? "1" : "")} label={tr("Offer this notification")}/>
            <L label={tr("Group label")}><input className="rm-input mt-1" dir="auto" value={String(v[label] ?? "")} onChange={(e) => set(label, e.target.value)}/></L>
            <L label={tr("Message text")}><textarea className="rm-input mt-1 font-mono text-xs" rows={3} dir="auto" value={String(v[sms] ?? "")} onChange={(e) => set(sms, e.target.value)}/></L>
          </div>))}
        <L label={tr("Custom notification groups")} hint={tr("One `code: label` per line.")}>
          <textarea className="rm-input mt-1 font-mono text-xs" rows={3} dir="auto" value={String(v.notif_options ?? "")} onChange={(e) => set("notif_options", e.target.value)}/>
        </L>
      </div>

      <div className="border-t border-rm-border pt-4 space-y-2">
        <p className="text-xs font-bold text-rm-muted uppercase tracking-wide">{tr("Product managers")}</p>
        <p className="text-xs text-rm-muted">{tr("These numbers receive the order and stock alerts for this product. They stand in for the Dokan vendor contact.")}</p>
        {admins.map((a, i) => (<div key={i} className="rounded border border-rm-border p-3 space-y-2">
            <div className="flex gap-2">
              <input className="rm-input flex-1" dir="ltr" placeholder={tr("Mobile")} value={a.mobile} onChange={(e) => setAdmin(i, { mobile: e.target.value })}/>
              <button className="rm-btn rm-btn-secondary" onClick={() => setAdmins((rows) => rows.filter((_, j) => j !== i))}>{tr("Remove")}</button>
            </div>
            <MultiCheck options={bundle?.buyerStatuses || []} value={a.statuses} onChange={(list) => setAdmin(i, { statuses: list })}/>
          </div>))}
        <button className="rm-btn rm-btn-secondary" onClick={() => setAdmins((rows) => [...rows, { mobile: "", statuses: [] }])}>{tr("Add manager")}</button>
      </div>

      <div className="border-t border-rm-border pt-4 space-y-2">
        <p className="text-xs font-bold text-rm-muted uppercase tracking-wide">{tr("Send a one-off message")}</p>
        <p className="text-xs text-rm-muted">{tr("Goes to everyone in the chosen notification group for this product.")}</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <select className="rm-input" value={manualGroup} onChange={(e) => setManualGroup(e.target.value)}>
            <option value="">{tr("Choose a group…")}</option>
            {Object.entries(groups).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
          <input className="rm-input" placeholder={tr("Message")} dir="auto" value={manualMessage} onChange={(e) => setManualMessage(e.target.value)}/>
        </div>
        <button className="rm-btn rm-btn-secondary" disabled={!manualGroup || !manualMessage.trim() || manualBusy} onClick={sendManual}>{manualBusy ? tr("Sending…") : tr("Send to group")}</button>
        {manualNote && <p className="text-xs text-rm-green font-semibold">{manualNote}</p>}
      </div>

      <div className="pt-3 border-t border-rm-border">
        <button className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }} disabled={busy} onClick={save}>{busy ? tr("Saving…") : tr("Save SMS settings")}</button>
      </div>
    </div>);
}
