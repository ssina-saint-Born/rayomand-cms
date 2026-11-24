"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { ErrorNote, fmtDateTime, L, OkNote, StatusBadge, useMoney, ShopHeader } from "./shared";
const STATUSES = ["pending", "processing", "on-hold", "completed", "cancelled", "refunded", "failed"];
export default function ShopOrderDetail({ id }: {
    id: number;
}) {
    const { t: tr, locale } = useI18n();
    const money = useMoney();
    const [order, setOrder] = useState<any>(null);
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState("");
    const [noteCustomer, setNoteCustomer] = useState(false);
    const [refundAmount, setRefundAmount] = useState("");
    const [refundReason, setRefundReason] = useState("");
    const [smsText, setSmsText] = useState("");
    const [smsBundle, setSmsBundle] = useState<any>(null);
    const [smsBusy, setSmsBusy] = useState(false);
    const load = useCallback(async () => {
        try {
            const o = await api<any>(`/api/commerce/orders/${id}`);
            setOrder(o);
            setStatus(o.status);
        }
        catch (e: any) {
            setError(e.message);
        }
    }, [id]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        api<any>("/api/commerce/sms/settings").then(setSmsBundle).catch(() => { });
    }, []);
    async function updateStatus() {
        setBusy(true);
        setError("");
        setMsg("");
        try {
            await api(`/api/commerce/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
            setMsg(tr("Order status updated to {0}.", { "0": tr(status) }));
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }
    async function addNote() {
        if (!note.trim())
            return;
        setBusy(true);
        setError("");
        try {
            await api(`/api/commerce/orders/${id}/notes`, { method: "POST", body: JSON.stringify({ content: note, is_customer_note: noteCustomer }) });
            setNote("");
            setMsg("Note added.");
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }
    async function refund() {
        const amount = Number(refundAmount);
        if (!amount || amount <= 0) {
            setError("Enter a refund amount greater than zero.");
            return;
        }
        setBusy(true);
        setError("");
        setMsg("");
        try {
            await api(`/api/commerce/orders/${id}/refunds`, { method: "POST", body: JSON.stringify({ amount, reason: refundReason }) });
            setRefundAmount("");
            setRefundReason("");
            setMsg(`Refund of ${money(amount)} recorded.`);
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
        setBusy(false);
    }
    async function sendSmsNow() {
        setSmsBusy(true);
        setError("");
        setMsg("");
        try {
            await api(`/api/commerce/orders/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ sms_send: true, sms_text: smsText || undefined }),
            });
            setSmsText("");
            setMsg(tr("SMS sent to the customer."));
            await load();
        }
        catch (e: any) {
            setError(e.message);
        }
        setSmsBusy(false);
    }
    if (error && !order)
        return <ErrorNote error={error}/>;
    if (!order)
        return <Spinner label={tr("Loading order…")}/>;
    const addr = (a: any) => [a.first_name + " " + a.last_name, a.company, a.address_1, a.address_2, [a.city, a.state, a.postcode].filter(Boolean).join(", "), a.country].filter(Boolean);
    const remaining = Math.max(0, order.total - order.refunded_total);
    return (<div>
      <ShopHeader title={tr("Order #{0}", {"0": String(order.number ?? "")})} sub={tr("Created {0}{1}", {"0": String(fmtDateTime(order.created_at, locale) ?? ""), "1": order.paid_at ? tr(" · Paid {0}", { "0": fmtDateTime(order.paid_at, locale) }) : ""})} action={<Link href="/studio/commerce/orders" className="rm-btn rm-btn-secondary">{tr("Back to orders")}</Link>}/>
      <ErrorNote error={error}/>
      <OkNote msg={msg}/>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="rm-admin-card">
            <div className="px-4 py-3 border-b border-rm-border flex items-center justify-between">
              <span className="font-semibold text-sm text-rm-dark">{tr("Items")}</span>
              <StatusBadge status={order.status}/>
            </div>
            <table className="rm-table">
              <thead><tr><th>{tr("Item")}</th><th>{tr("SKU")}</th><th>{tr("Qty")}</th><th>{tr("Total")}</th></tr></thead>
              <tbody>
                {order.items.map((i: any) => (<tr key={i.id}>
                    <td className="font-semibold">{i.name}</td>
                    <td className="text-rm-muted">{i.sku || "—"}</td>
                    <td>{i.quantity}</td>
                    <td>{money(i.total)}</td>
                  </tr>))}
              </tbody>
            </table>
            <div className="p-4 space-y-1.5 text-sm border-t border-rm-border">
              <div className="flex justify-between"><span className="text-rm-muted">{tr("Subtotal")}</span><span>{money(order.items.reduce((a: number, i: any) => a + i.subtotal, 0))}</span></div>
              {order.discount_total > 0 && <div className="flex justify-between text-rm-green"><span>{tr("Discount")}</span><span>−{money(order.discount_total)}</span></div>}
              {order.shipping_total > 0 && <div className="flex justify-between"><span className="text-rm-muted">{tr("Shipping")}{order.shipping_method ? ` · ${order.shipping_method}` : ""}</span><span>{money(order.shipping_total)}</span></div>}
              {(order.tax_lines?.length ? order.tax_lines : []).map((tl: any, i: number) => (
                <div key={i} className="flex justify-between"><span className="text-rm-muted">{tl.name} ({tl.rate}%)</span><span>{money(tl.amount)}</span></div>
              ))}
              {!order.tax_lines?.length && order.total_tax > 0 && <div className="flex justify-between"><span className="text-rm-muted">{tr("Tax")}</span><span>{money(order.total_tax)}</span></div>}
              {order.shipping_tax > 0 && <p className="text-xs text-rm-muted">{tr("Includes {0} tax on shipping", {"0": money(order.shipping_tax)})}</p>}
              {order.refunded_total > 0 && <div className="flex justify-between text-rm-red"><span>{tr("Refunded")}</span><span>−{money(order.refunded_total)}</span></div>}
              <div className="flex justify-between font-bold text-base pt-1.5 border-t border-rm-border"><span>{tr("Total")}</span><span style={{ color: "#656080" }}>{money(order.total)}</span></div>
              <p className="text-xs text-rm-muted pt-1">{tr("Payment:")}{" "}{tr(order.payment_method_title || order.payment_method)}{order.transaction_id ? tr("· Transaction {0}", {"0": String(order.transaction_id ?? "")}) : ""}</p>
            </div>
          </div>

          <div className="rm-admin-card">
            <div className="px-4 py-3 border-b border-rm-border font-semibold text-sm text-rm-dark">{tr("Order notes")}</div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <textarea className="rm-input" rows={2} placeholder={tr("Add a note…")} value={note} onChange={(e) => setNote(e.target.value)}/>
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={noteCustomer} onChange={(e) => setNoteCustomer(e.target.checked)}/> {tr("Note to customer (visible on their order page)")}</label>
                <button className="rm-btn rm-btn-secondary" disabled={busy || !note.trim()} onClick={addNote}>{tr("Add note")}</button>
              </div>
              <ul className="space-y-2 pt-2 border-t border-rm-border">
                {order.notes.map((n: any) => (<li key={n.id} className={`text-sm rounded px-3 py-2 ${n.is_customer_note ? "bg-[#f3edfa]" : "bg-rm-gray/70"}`}>
                    <p>{n.content}</p>
                    <p className="text-xs text-rm-muted mt-1">{n.author} · {fmtDateTime(n.created_at, locale)}{n.is_customer_note ? tr("· customer note") : ""}</p>
                  </li>))}
                {!order.notes.length && <p className="text-sm text-rm-muted">{tr("No notes yet.")}</p>}
              </ul>
            </div>
          </div>

          {order.refunds.length > 0 && (<div className="rm-admin-card">
              <div className="px-4 py-3 border-b border-rm-border font-semibold text-sm text-rm-dark">{tr("Refunds")}</div>
              <ul className="p-4 space-y-2 text-sm">
                {order.refunds.map((r: any) => (<li key={r.id} className="flex justify-between gap-3">
                    <span className="text-rm-muted">{fmtDateTime(r.created_at, locale)}{r.reason ? ` — ${r.reason}` : ""}</span>
                    <span className="font-bold text-rm-red">−{money(r.amount)}</span>
                  </li>))}
              </ul>
            </div>)}
        </div>

        <div className="space-y-4">
          <div className="rm-admin-card p-4 space-y-3">
            <h2 className="font-semibold text-sm text-rm-dark">{tr("Order actions")}</h2>
            <L label={tr("Status")}>
              <select className="rm-input mt-1" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{tr(s)}</option>)}
              </select>
            </L>
            <button className="rm-btn rm-btn-primary w-full" style={{ background: "#656080", borderColor: "#656080" }} disabled={busy || status === order.status} onClick={updateStatus}>
              {busy ? tr("Working…") : tr("Update status")}
            </button>
            <p className="text-xs text-rm-muted">{tr("Moving to/from processing or completed adjusts stock and sales counts automatically.")}</p>
          </div>

          <div className="rm-admin-card p-4 space-y-3">
            <h2 className="font-semibold text-sm text-rm-dark">{tr("Send SMS to customer")}</h2>
            <p className="text-xs text-rm-muted">{tr("Leave the message empty to use the saved text for the current status.")}</p>
            <textarea className="rm-input" rows={4} dir="auto" placeholder={tr("Message (optional)")} value={smsText} onChange={(e) => setSmsText(e.target.value)}/>
            {smsBundle && (
              <details className="text-xs">
                <summary className="cursor-pointer text-rm-muted">{tr("Preview the saved template")}</summary>
                <pre className="mt-1 whitespace-pre-wrap rounded bg-rm-gray/70 p-2 font-sans text-rm-text" dir="auto">{String(smsBundle.settings[`sms_body_${status}`] ?? "")}</pre>
              </details>
            )}
            <p className="text-xs text-rm-muted">{tr("Sends to:")}{" "}<span className="font-mono" dir="ltr">{order.billing?.phone || tr("no number on file")}</span></p>
            <button className="rm-btn rm-btn-secondary w-full" disabled={smsBusy || !order.billing?.phone} onClick={sendSmsNow}>
              {smsBusy ? tr("Sending…") : tr("Send SMS")}
            </button>
          </div>

          <div className="rm-admin-card p-4 space-y-3">
            <h2 className="font-semibold text-sm text-rm-dark">{tr("Manual refund record")}</h2>
            <p className="text-xs text-rm-muted">{tr("This records bookkeeping only. Transfer funds through your actual payment channel separately.")}</p>
            <p className="text-xs text-rm-muted">{tr("Remaining refundable:")}{" "}<span className="font-bold">{money(remaining)}</span></p>
            <input className="rm-input" type="number" step="0.01" min="0" max={remaining} placeholder={tr("Amount")} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)}/>
            <input className="rm-input" placeholder={tr("Reason (optional)")} value={refundReason} onChange={(e) => setRefundReason(e.target.value)}/>
            <button className="rm-btn rm-btn-danger w-full" disabled={busy || remaining <= 0} onClick={refund}>{tr("Record refund")}</button>
          </div>

          <div className="rm-admin-card p-4">
            <h2 className="font-semibold text-sm text-rm-dark mb-2">{tr("Billing")}</h2>
            <address className="text-sm not-italic text-rm-text space-y-0.5">
              {addr(order.billing).map((l, i) => <p key={i}>{l}</p>)}
              {order.billing?.email && <p className="text-rm-blue">{order.billing.email}</p>}
              {order.billing?.phone && <p className="text-rm-muted">{order.billing.phone}</p>}
            </address>
            {order.shipping?.address_1 && (<>
                <h2 className="font-semibold text-sm text-rm-dark mt-4 mb-2">{tr("Shipping")}</h2>
                <address className="text-sm not-italic text-rm-text space-y-0.5">
                  {addr(order.shipping).map((l, i) => <p key={i}>{l}</p>)}
                </address>
              </>)}
            {order.customer_note && (<>
                <h2 className="font-semibold text-sm text-rm-dark mt-4 mb-1">{tr("Customer note")}</h2>
                <p className="text-sm text-rm-muted italic">“{order.customer_note}”</p>
              </>)}
            {order.customer && (<p className="text-xs text-rm-muted mt-4 pt-3 border-t border-rm-border">
                {tr("Registered customer:")}<span className="font-semibold">{order.customer.display_name}</span> (@{order.customer.username})
              </p>)}
          </div>
        </div>
      </div>
    </div>);
}
