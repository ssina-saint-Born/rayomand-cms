"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { ErrorNote, fmtDateTime, OkNote, ShopHeader } from "./shared";
function Stars({ n }: {
    n: number;
}) {
    const { t: tr } = useI18n();
    return (<span className="inline-flex gap-0.5" aria-label={tr("{0} out of 5 stars", {"0": String(n ?? "")})}>
      {[1, 2, 3, 4, 5].map((i) => (<svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i <= n ? "#a58c64" : "#e4dcee"}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>
        </svg>))}
    </span>);
}
export default function ShopReviews() {
    const { t: tr, locale } = useI18n();
    const [items, setItems] = useState<any[] | null>(null);
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");
    const [status, setStatus] = useState("any");
    const load = useCallback(async () => {
        try {
            setItems((await api<any>(`/api/commerce/reviews?status=${status}`)).items);
        }
        catch (e: any) {
            setError(e.message);
        }
    }, [status]);
    useEffect(() => { load(); }, [load]);
    async function act(id: number, action: "approved" | "hold" | "delete") {
        setError("");
        setMsg("");
        try {
            if (action === "delete") {
                if (!confirm(tr("Delete this review permanently?")))
                    return;
                await api(`/api/commerce/reviews/${id}`, { method: "DELETE" });
                setMsg("Review deleted.");
            }
            else {
                await api(`/api/commerce/reviews/${id}`, { method: "PATCH", body: JSON.stringify({ status: action }) });
                setMsg(action === "approved" ? "Review approved." : "Review unapproved.");
            }
            load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    const pending = (items || []).filter((r) => r.status !== "approved").length;
    return (<div>
      <ShopHeader title={tr("Product reviews")} sub={items ? tr("{0} reviews{1}", {"0": String(items.length ?? ""), "1": pending ? tr(" · {0} awaiting moderation", { "0": pending }) : ""}) : undefined}/>
      <ErrorNote error={error}/>
      <OkNote msg={msg}/>
      <div className="flex gap-1.5 mb-4">
        {[["any", "All"], ["approved", "Approved"], ["hold", "Pending"]].map(([v, l]) => (<button key={v} onClick={() => setStatus(v)} className={`px-3 py-1.5 rounded-full text-xs font-bold border ${status === v ? "text-white border-transparent" : "bg-white text-rm-text border-rm-border hover:border-rm-blue"}`} style={status === v ? { background: "#656080" } : undefined}>
            {tr(l)}
          </button>))}
      </div>
      {!items ? <Spinner /> : (<div className="rm-admin-card overflow-x-auto">
          <table className="rm-table min-w-[760px]">
            <thead><tr><th>{tr("Author")}</th><th>{tr("Rating")}</th><th>{tr("Review")}</th><th>{tr("Product")}</th><th>{tr("Submitted")}</th><th>{tr("Actions")}</th></tr></thead>
            <tbody>
              {items.map((r) => (<tr key={r.id} className={r.status !== "approved" ? "bg-yellow-50/60" : ""}>
                  <td>
                    <span className="font-semibold">{r.author_name}</span>
                    <span className="block text-xs text-rm-muted">{r.author_email}</span>
                    {r.verified ? <span className="rm-badge mt-1" style={{ background: "#e2f5e7", color: "#405b49" }}>{tr("Verified owner")}</span> : null}
                  </td>
                  <td><Stars n={r.rating}/></td>
                  <td className="max-w-md">
                    <p className="text-sm">{r.content}</p>
                    <span className={`rm-badge mt-1 ${r.status === "approved" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>{r.status === "approved" ? tr("approved") : tr("pending")}</span>
                  </td>
                  <td><Link href={`/studio/commerce/products/${r.product_id}`} className="text-rm-blue hover:underline text-sm">{r.product_name}</Link></td>
                  <td className="text-rm-muted text-xs whitespace-nowrap">{fmtDateTime(r.created_at, locale)}</td>
                  <td className="whitespace-nowrap text-sm">
                    {r.status !== "approved" ? <button className="text-rm-green hover:underline me-3 font-semibold" onClick={() => act(r.id, "approved")}>{tr("Approve")}</button> : <button className="text-rm-muted hover:underline me-3" onClick={() => act(r.id, "hold")}>{tr("Unapprove")}</button>}
                    <button className="text-rm-red hover:underline" onClick={() => act(r.id, "delete")}>{tr("Delete")}</button>
                  </td>
                </tr>))}
              {!items.length && <tr><td colSpan={6} className="text-center text-rm-muted py-8">{tr("No reviews here.")}</td></tr>}
            </tbody>
          </table>
        </div>)}
    </div>);
}
