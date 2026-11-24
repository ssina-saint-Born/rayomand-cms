"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Spinner } from "@/components/admin/ui";
import { ErrorNote, fmtDate, Pager, useMoney, ShopHeader } from "./shared";
const TYPES = ["simple", "variable", "grouped", "external"];
export default function ShopProducts() {
    const { t: tr, locale } = useI18n();
    const money = useMoney();
    const [data, setData] = useState<any>(null);
    const [error, setError] = useState("");
    const [msg, setMsg] = useState("");
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("any");
    const [type, setType] = useState("");
    const [orderby, setOrderby] = useState("date");
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<number[]>([]);
    const load = useCallback(async () => {
        setError("");
        try {
            const q = new URLSearchParams({ status, orderby, page: String(page), per_page: "15" });
            if (search)
                q.set("search", search);
            if (type)
                q.set("type", type);
            setData(await api(`/api/commerce/products?${q}`));
            setSelected([]);
        }
        catch (e: any) {
            setError(e.message);
        }
    }, [search, status, type, orderby, page]);
    useEffect(() => { load(); }, [load]);
    async function trash(ids: number[]) {
        if (!confirm(tr("Move {0} product(s) to trash? This deletes them permanently in this clone.", {"0": String(ids.length ?? "")})))
            return;
        try {
            for (const id of ids)
                await api(`/api/commerce/products/${id}`, { method: "DELETE" });
            setMsg(`${ids.length} product(s) deleted.`);
            load();
        }
        catch (e: any) {
            setError(e.message);
        }
    }
    const items = data?.items || [];
    const allChecked = items.length > 0 && selected.length === items.length;
    return (<div>
      <ShopHeader title={tr("Products")} sub={data ? tr("{0} products", {"0": String(data.total ?? "")}) : undefined} action={<Link href="/studio/commerce/products/new" className="rm-btn rm-btn-primary" style={{ background: "#656080", borderColor: "#656080" }}>{tr("Add new product")}</Link>}/>
      <ErrorNote error={error}/>
      {msg && <div role="status" className="noma-notice bg-green-50 text-rm-green">{tr(msg)}</div>}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input className="rm-input !w-56" placeholder={tr("Search products…")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}/>
        <select className="rm-input !w-36" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="any">{tr("All statuses")}</option>
          <option value="publish">{tr("Published")}</option>
          <option value="draft">{tr("Draft")}</option>
          <option value="pending">{tr("Pending")}</option>
          <option value="private">{tr("Private")}</option>
        </select>
        <select className="rm-input !w-36" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
          <option value="">{tr("All types")}</option>
          {TYPES.map((t) => <option key={t} value={t}>{tr(t[0].toUpperCase() + t.slice(1))}</option>)}
        </select>
        <select className="rm-input !w-40" value={orderby} onChange={(e) => { setOrderby(e.target.value); setPage(1); }}>
          <option value="date">{tr("Sort: newest")}</option>
          <option value="title">{tr("Sort: name")}</option>
          <option value="price">{tr("Sort: price")}</option>
          <option value="popularity">{tr("Sort: sales")}</option>
          <option value="rating">{tr("Sort: rating")}</option>
        </select>
        {selected.length > 0 && (<button className="rm-btn rm-btn-danger" onClick={() => trash(selected)}>{tr("Delete selected (")}{selected.length})</button>)}
      </div>

      {!data ? <Spinner /> : (<div className="rm-admin-card overflow-x-auto">
          <table className="rm-table min-w-[820px]">
            <thead>
              <tr>
                <th className="w-8"><input type="checkbox" checked={allChecked} onChange={(e) => setSelected(e.target.checked ? items.map((p: any) => p.id) : [])}/></th>
                <th className="w-12"></th>
                <th>{tr("Name")}</th><th>{tr("SKU")}</th><th>{tr("Price")}</th><th>{tr("Stock")}</th><th>{tr("Type")}</th><th>{tr("Sales")}</th><th>{tr("Downloads")}</th><th>{tr("Date")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p: any) => (<tr key={p.id}>
                  <td><input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id))}/></td>
                  <td>
                    {p.images?.[0] ? <img src={p.images[0].src} alt="" className="w-10 h-10 rounded object-cover border border-rm-border"/> : <div className="w-10 h-10 rounded bg-rm-gray border border-rm-border"/>}
                  </td>
                  <td>
                    <Link href={`/studio/commerce/products/${p.id}`} className="text-rm-blue font-semibold hover:underline">{p.name}</Link>
                    <div className="text-xs mt-0.5 flex gap-2 items-center flex-wrap">
                      <span className={`rm-badge ${p.status === "publish" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>{tr(p.status)}</span>
                      {p.free_download && <span className="rm-badge" style={{ background: "#e2f5e7", color: "#405b49" }}>{tr("Free download")}</span>}
                      {p.featured ? <span className="rm-badge" style={{ background: "#f3edfa", color: "#656080" }}>{tr("Featured")}</span> : null}
                      {p.on_sale && <span className="rm-badge" style={{ background: "#fbe9f0", color: "#8c6372" }}>{tr("Sale")}</span>}
                    </div>
                    <div className="text-xs text-rm-muted mt-0.5">
                      <Link href={`/collection/items/${p.slug}`} className="hover:underline">{tr("View")}</Link>
                      {" · "}
                      <button className="text-rm-red hover:underline" onClick={() => trash([p.id])}>{tr("Delete")}</button>
                    </div>
                  </td>
                  <td className="text-rm-muted">{p.sku || "—"}</td>
                  <td>
                    {p.price == null ? "—" : p.on_sale ? <span><span className="text-rm-muted line-through me-1">{money(p.regular_price)}</span><span className="font-semibold" style={{ color: "#8c6372" }}>{money(p.price)}</span></span> : <span className="font-semibold">{p.price === 0 ? tr("Free") : money(p.price)}</span>}
                  </td>
                  <td>
                    {p.manage_stock ? <span className={p.stock_quantity === 0 ? "text-rm-red font-bold" : p.stock_quantity <= 5 ? "text-rm-yellow font-bold" : ""}>{tr("{0} in stock", { "0": p.stock_quantity })}</span> : <span className="text-rm-muted capitalize">{tr(p.stock_status === "instock" ? "In stock" : p.stock_status)}</span>}
                  </td>
                  <td className="capitalize text-rm-muted">{tr(p.type)}</td>
                  <td>{p.total_sales}</td>
                  <td>{p.free_download || p.downloadable ? <span className="font-semibold" style={{ color: "#4c6c57" }}>{p.download_count ?? "—"}</span> : "—"}</td>
                  <td className="text-rm-muted whitespace-nowrap">{fmtDate(p.created_at, locale)}</td>
                </tr>))}
              {!items.length && <tr><td colSpan={10} className="text-center text-rm-muted py-8">{tr("No products match these filters.")}</td></tr>}
            </tbody>
          </table>
        </div>)}
      <div className="mt-4"><Pager page={page} pages={data?.pages || 1} onPage={setPage}/></div>
    </div>);
}
