"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { useStore } from "@/components/shop/StoreContext";
import ProductCard from "@/components/shop/ProductCard";
import type { ShopProduct } from "@/lib/shop/products";
const SORTS = [
    { value: "date", label: "Latest" },
    { value: "popularity", label: "Best selling" },
    { value: "rating", label: "Top rated" },
    { value: "price-asc", label: "Price: low to high" },
    { value: "price-desc", label: "Price: high to low" },
    { value: "title", label: "Alphabetical" },
];
export default function ShopBrowser() {
    const { t: tr } = useI18n();
    const { settings } = useStore();
    const sp = useSearchParams();
    const [items, setItems] = useState<ShopProduct[]>([]);
    const [total, setTotal] = useState(0);
    const [pages, setPages] = useState(1);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState(sp.get("search") || "");
    const [category, setCategory] = useState(sp.get("category") || "");
    const [tag, setTag] = useState(sp.get("tag") || "");
    const [sort, setSort] = useState("date");
    const [freeOnly, setFreeOnly] = useState(sp.get("free") === "1");
    const [onSale, setOnSale] = useState(false);
    const [email, setEmail] = useState("");
    const [subMsg, setSubMsg] = useState("");
    useEffect(() => {
        setLoading(true);
        const [orderby, order] = sort.startsWith("price") ? ["price", sort.split("-")[1]] : [sort, sort === "title" ? "asc" : "desc"];
        const params = new URLSearchParams({ orderby, order, page: String(page), per_page: "9" });
        if (search)
            params.set("search", search);
        if (category)
            params.set("category", category);
        if (tag)
            params.set("tag", tag);
        if (freeOnly)
            params.set("free", "1");
        if (onSale)
            params.set("on_sale", "1");
        api<{
            items: ShopProduct[];
            total: number;
            pages: number;
        }>(`/api/storefront/products?${params}`).then((r) => { setItems(r.items); setTotal(r.total); setPages(r.pages); })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [search, category, tag, sort, freeOnly, onSale, page]);
    async function subscribe(e: React.FormEvent) {
        e.preventDefault();
        try {
            const r = await api<{
                already?: boolean;
            }>("/api/downloads/subscribe", { method: "POST", body: JSON.stringify({ email }) });
            setSubMsg(r.already ? "You're already subscribed — thanks!" : "Subscribed! Watch your inbox for new free downloads.");
            setEmail("");
        }
        catch (err: any) {
            setSubMsg(err.message);
        }
    }
    const cols = Number(settings?.shop_columns || 3);
    return (<div className="space-y-8">
      <section className="shop-hero rounded-2xl px-8 sm:px-12 py-12 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <p className="noma-eyebrow mb-4">{tr("The Rayomand CMS collection")}</p>
          <h1 className="text-4xl sm:text-5xl leading-tight">{tr("Small finds. Big possibilities.")}</h1>
          <p className="noma-hero-description mt-4 text-base max-w-xl leading-relaxed">
            {total} {tr("products available. Browse the current catalog and download eligible files directly.")}</p>
          <div className="mt-6 flex gap-3 flex-wrap">
            <button onClick={() => { setFreeOnly(true); setOnSale(false); setPage(1); }} className="shop-btn shop-btn-free">{tr("Browse free downloads")}</button>
            <button onClick={() => { setFreeOnly(false); setOnSale(false); setCategory(""); setPage(1); }} className="shop-btn shop-btn-outline">{tr("Everything")}</button>
          </div>
        </div>
        <div className="noma-hero-art" aria-hidden="true"/>
      </section>

      <section className="shop-card p-4 flex flex-wrap items-center gap-3">
        <input className="shop-input max-w-xs" placeholder={tr("Search products…")} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}/>
        <select className="shop-input w-auto" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
          <option value="">{tr("All categories")}</option>
          {(settings?.categories || []).map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
        <select className="shop-input w-auto" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{tr(s.label)}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input type="checkbox" checked={freeOnly} onChange={(e) => { setFreeOnly(e.target.checked); setPage(1); }}/> {tr("Free only")}</label>
        <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
          <input type="checkbox" checked={onSale} onChange={(e) => { setOnSale(e.target.checked); setPage(1); }}/> {tr("On sale")}</label>
        <span className="ms-auto text-sm text-shop-muted">{total} {" "}{tr("result")}{total === 1 ? "" : tr("s")}</span>
      </section>

      {loading ? (<div className={`grid gap-5 grid-cols-1 sm:grid-cols-2 ${{ 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" }[cols as 1 | 2 | 3 | 4] || "lg:grid-cols-3"}`}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="shop-card h-72 animate-pulse bg-shop-border/40"/>)}
        </div>) : items.length === 0 ? (<div className="shop-card p-12 text-center text-shop-muted">{tr("No products match your filters.")}</div>) : (<div className={`grid gap-5 grid-cols-1 sm:grid-cols-2 ${{ 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" }[cols as 1 | 2 | 3 | 4] || "lg:grid-cols-3"}`}>
          {items.map((p) => <ProductCard key={p.id} product={p}/>)}
        </div>)}

      {pages > 1 && (<div className="flex justify-center gap-2">
          {Array.from({ length: pages }).map((_, i) => (<button key={i} onClick={() => setPage(i + 1)} className={`w-9 h-9 rounded-md font-bold text-sm ${page === i + 1 ? "bg-shop-purple text-white" : "shop-card text-shop-purple hover:bg-shop-border/40"}`}>
              {i + 1}
            </button>))}
        </div>)}

      {settings?.downloads?.newsletter_enable ? (<section className="shop-card p-6 flex flex-col sm:flex-row items-center gap-4 !bg-[#f1edf3]">
          <div className="flex-1">
            <h2 className="font-extrabold text-lg">{tr("Join the mailing list")}</h2>
            <p className="text-sm text-shop-muted">{tr("Subscriptions are stored by this site. Email delivery requires the store to configure SMTP.")}</p>
            {subMsg && <p className="text-sm font-semibold text-shop-green mt-1">{subMsg}</p>}
          </div>
          <form onSubmit={subscribe} className="flex gap-2 w-full sm:w-auto">
            <input className="shop-input sm:w-64" type="email" required placeholder={tr("you@example.com")} value={email} onChange={(e) => setEmail(e.target.value)}/>
            <button className="shop-btn shop-btn-primary">{tr("Subscribe")}</button>
          </form>
        </section>) : null}
    </div>);
}
