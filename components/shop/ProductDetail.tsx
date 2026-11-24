"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/client";
import { useStore } from "@/components/shop/StoreContext";
import Stars from "@/components/shop/Stars";
import ProductCard from "@/components/shop/ProductCard";
import FreeDownloadButton from "@/components/shop/FreeDownloadButton";
import ProductNewsletter from "@/components/shop/ProductNewsletter";
import type { ShopProduct } from "@/lib/shop/products";
interface Detail {
    product: ShopProduct;
    state: any;
    reviews: any[];
    related: ShopProduct[];
}
export default function ProductDetail() {
    const { t: tr, locale } = useI18n();
    const { slug } = useParams<{
        slug: string;
    }>();
    const { money, addToCart, settings, toast } = useStore();
    const [data, setData] = useState<Detail | null>(null);
    const [error, setError] = useState("");
    const [qty, setQty] = useState(1);
    const [variationId, setVariationId] = useState(0);
    const [tab, setTab] = useState<"description" | "reviews">("description");
    const [busy, setBusy] = useState(false);
    const [review, setReview] = useState({ rating: 5, content: "", author_name: "", author_email: "" });
    const [reviewMsg, setReviewMsg] = useState("");
    const [activeImg, setActiveImg] = useState(0);
    useEffect(() => {
        api<Detail>(`/api/storefront/products/${encodeURIComponent(slug)}`).then((d) => {
            setData(d);
            if (d.product.type === "variable" && d.product.variations?.length)
                setVariationId(d.product.variations[0].id);
        })
            .catch((e) => setError(e.message));
    }, [slug]);
    if (error)
        return <div className="shop-card p-12 text-center text-shop-red font-semibold">{tr(error)}</div>;
    if (!data)
        return <div className="shop-card h-96 animate-pulse bg-shop-border/40"/>;
    const { product: p, state, reviews, related } = data;
    const ecommerceOff = !!settings?.disable_ecommerce;
    const variation = p.variations?.find((v) => v.id === variationId);
    const shownPrice = variation ? variation.price : p.price;
    const images = p.images?.length ? p.images : [];
    const canBuy = !ecommerceOff && !p.free_download && p.type !== "grouped" && p.stock_status !== "outofstock";
    async function add() {
        setBusy(true);
        const ok = await addToCart(p.id, qty, p.type === "variable" ? variationId : 0);
        setBusy(false);
        if (ok)
            setQty(1);
    }
    async function submitReview(e: React.FormEvent) {
        e.preventDefault();
        setReviewMsg("");
        try {
            await api("/api/storefront/reviews", { method: "POST", body: JSON.stringify({ product_id: p.id, ...review }) });
            const fresh = await api<Detail>(`/api/storefront/products/${p.id}`);
            setData(fresh);
            setReview({ rating: 5, content: "", author_name: "", author_email: "" });
            setReviewMsg("Thanks! Your review is live.");
            toast("success", "Review published.");
        }
        catch (err: any) {
            setReviewMsg(err.message);
        }
    }
    return (<div className="space-y-10">
      <nav className="text-sm text-shop-muted">
        <Link href="/collection" className="hover:text-shop-purple font-semibold">{tr("Shop")}</Link>
        {p.categories?.[0] && <> / <Link href={`/collection?category=${p.categories[0].slug}`} className="hover:text-shop-purple">{p.categories[0].name}</Link></>}
        {" / "}<span className="text-shop-ink font-semibold">{p.name}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-8">
        <div>
          <div className="shop-card overflow-hidden relative aspect-square bg-shop-bg">
            {images[activeImg] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={images[activeImg].src} alt={images[activeImg].alt || p.name} className="w-full h-full object-cover"/>) : <div className="w-full h-full flex items-center justify-center text-shop-muted">{tr("No image")}</div>}
            <div className="absolute top-3 start-3 flex gap-2">
              {p.free_download && !settings?.downloads?.hide_badge && <span className="shop-badge bg-shop-green text-white">{tr(settings?.downloads?.badge_text || "Free")}</span>}
              {p.on_sale && <span className="shop-badge bg-shop-magenta text-white">{tr("Sale")}</span>}
            </div>
          </div>
          {images.length > 1 && (<div className="flex gap-2 mt-3">
              {images.map((im, i) => (<button key={i} onClick={() => setActiveImg(i)} className={`w-16 h-16 rounded-md overflow-hidden border-2 ${i === activeImg ? "border-shop-purple" : "border-shop-border"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={im.src} alt="" className="w-full h-full object-cover"/>
                </button>))}
            </div>)}
          <div className="mt-4"><ProductNewsletter productId={p.id} slot="thumbnail"/></div>
        </div>

        <div className="space-y-4">
          <h1 className="text-3xl font-extrabold leading-tight">{p.name}</h1>
          <div className="flex items-center gap-3">
            {p.rating_count > 0 ? <Stars rating={p.average_rating} count={p.rating_count} size={16}/> : <span className="text-sm text-shop-muted">{tr("No reviews yet")}</span>}
            {state?.countText && settings?.downloads?.download_counts ? <span className="text-xs text-shop-muted">· {tr(state.countText)}</span> : null}
          </div>
          <div className="text-2xl font-extrabold">
            {p.free_download ? (<span className="text-shop-green">{money(0)} {" "}{tr("— free download")}</span>) : (<>
                {p.on_sale && <span className="text-shop-muted line-through text-lg font-normal me-2">{money(p.regular_price || 0)}</span>}
                <span className="text-shop-purple">{money(shownPrice || 0)}</span>
              </>)}
          </div>
          {p.short_description && <p className="text-shop-muted leading-relaxed">{p.short_description}</p>}

          {p.type === "variable" && (<div className="shop-card p-4 space-y-2">
              <label className="text-sm font-bold block">{tr("Choose an edition")}</label>
              <select className="shop-input" value={variationId} onChange={(e) => setVariationId(Number(e.target.value))}>
                {(p.variations || []).map((v) => (<option key={v.id} value={v.id}>{v.attributes?.map((a: any) => `${a.name}: ${a.option}`).join(", ") || v.name} — {money(v.price || 0)}</option>))}
              </select>
              {variation && <p className="text-xs text-shop-muted">{variation.stock_status === "instock" ? tr("In stock") : tr("Out of stock")}{variation.sku ? tr("· SKU {0}", {"0": String(variation.sku ?? "")}) : ""}</p>}
            </div>)}

          {p.type === "grouped" && (<div className="shop-card p-4 space-y-3">
              <p className="text-sm font-bold">{tr("Buy each item separately:")}</p>
              {(p.grouped || []).map((g) => (<div key={g.id} className="flex items-center justify-between gap-3 border-b border-shop-border pb-2 last:border-0 last:pb-0">
                  <Link href={`/collection/items/${g.slug}`} className="text-sm font-semibold hover:text-shop-purple">{g.name}</Link>
                  <span className="text-sm font-bold">{g.free_download ? <span className="text-shop-green">{tr("Free")}</span> : money(g.price || 0)}</span>
                  {g.free_download ? (<FreeDownloadButton product={g} compact/>) : !ecommerceOff ? (<button className="shop-btn shop-btn-primary shop-btn-sm" onClick={() => addToCart(g.id, 1)}>{tr("Add to cart")}</button>) : null}
                </div>))}
            </div>)}

          {state?.offered ? (<div className="shop-card p-5 !bg-[#edf3e7]">
              <FreeDownloadButton product={variation ? { ...p, files: variation.files } : p} variationId={p.type === "variable" ? variationId : 0} state={state}/>
            </div>) : canBuy ? (<div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center border border-shop-border rounded-md overflow-hidden">
                <button className="px-3 py-2.5 font-bold text-shop-purple hover:bg-shop-bg" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
                <input className="w-12 text-center font-bold outline-none" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}/>
                <button className="px-3 py-2.5 font-bold text-shop-purple hover:bg-shop-bg" onClick={() => setQty(qty + 1)}>+</button>
              </div>
              <button className="shop-btn shop-btn-primary" disabled={busy} onClick={add}>{busy ? tr("Adding…") : tr("Add to cart")}</button>
              {p.manage_stock && p.stock_quantity != null && <span className="text-sm text-shop-muted">{p.stock_quantity} {" "}{tr("in stock")}</span>}
            </div>) : p.stock_status === "outofstock" ? (<p className="shop-badge bg-shop-red/10 text-shop-red">{tr("Out of stock")}</p>) : ecommerceOff ? (<p className="text-sm text-shop-muted">{tr("Purchasing is disabled on this site.")}</p>) : null}

          <div className="text-xs text-shop-muted space-y-1 pt-2 border-t border-shop-border">
            {p.sku && <p>{tr("SKU:")}{" "}<span className="font-semibold text-shop-ink">{p.sku}</span></p>}
            {p.categories?.length ? <p>{tr("Categories:")}{" "}{p.categories.map((c, i) => <span key={c.id}>{i > 0 && ", "}<Link className="text-shop-purple hover:underline" href={`/collection?category=${c.slug}`}>{c.name}</Link></span>)}</p> : null}
            {p.tags?.length ? <p>{tr("Tags:")}{" "}{p.tags.map((t, i) => <span key={t.id}>{i > 0 && ", "}<Link className="text-shop-purple hover:underline" href={`/collection?tag=${t.slug}`}>{t.name}</Link></span>)}</p> : null}
          </div>
          <ProductNewsletter productId={p.id} slot="on"/>
        </div>
      </div>

      <div className="shop-card">
        <div className="noma-tab-strip" aria-label={tr("Product information")}>
          {(["description", "reviews"] as const).map((t) => (<button key={t} onClick={() => setTab(t)} className="noma-tab capitalize" aria-pressed={tab === t}>
              {t === "reviews" ? tr("Reviews ({0})", {"0": String(reviews.length ?? "")}) : tr("Description")}
            </button>))}
        </div>
        <div className="p-6">
          {tab === "description" ? (<div className="prose max-w-none text-[15px] leading-relaxed whitespace-pre-wrap">{p.description || tr("No description provided.")}</div>) : (<div className="space-y-6">
              {reviews.length === 0 && <p className="text-shop-muted text-sm">{tr("There are no reviews yet. Be the first!")}</p>}
              {reviews.map((r) => (<div key={r.id} className="flex gap-4 border-b border-shop-border pb-4 last:border-0">
                  <div className="w-10 h-10 rounded-full bg-shop-purple text-white font-bold flex items-center justify-center shrink-0">
                    {(r.author_name || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{r.author_name}</span>
                      <Stars rating={r.rating}/>
                      {r.verified ? <span className="shop-badge bg-shop-green/10 text-shop-green">{tr("Verified owner")}</span> : null}
                    </div>
                    <p className="text-xs text-shop-muted">{new Date(r.created_at).toLocaleDateString(locale === "fa" ? "fa-IR" : "en-US")}</p>
                    <p className="text-sm mt-1 leading-relaxed">{r.content}</p>
                  </div>
                </div>))}
              {settings?.enable_reviews ? (<form onSubmit={submitReview} className="shop-card p-5 space-y-3 bg-shop-bg/60">
                  <h3 className="font-bold">{tr("Add a review")}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{tr("Your rating")}</span>
                    {[1, 2, 3, 4, 5].map((n) => (<button type="button" key={n} onClick={() => setReview({ ...review, rating: n })} className="text-xl" style={{ color: n <= review.rating ? "#a58c64" : "#cbbfe0" }}>★</button>))}
                  </div>
                  <textarea className="shop-input" rows={3} required placeholder={tr("What did you think of this product?")} value={review.content} onChange={(e) => setReview({ ...review, content: e.target.value })}/>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input className="shop-input" placeholder={tr("Name")} value={review.author_name} onChange={(e) => setReview({ ...review, author_name: e.target.value })}/>
                    <input className="shop-input" type="email" placeholder={tr("Email")} value={review.author_email} onChange={(e) => setReview({ ...review, author_email: e.target.value })}/>
                  </div>
                  {reviewMsg && <p className="text-sm font-semibold text-shop-purple">{reviewMsg}</p>}
                  <button className="shop-btn shop-btn-primary">{tr("Submit review")}</button>
                </form>) : null}
            </div>)}
        </div>
      </div>

      {related.length > 0 && (<section>
          <h2 className="text-xl font-extrabold mb-4">{tr("Related products")}</h2>
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((r) => <ProductCard key={r.id} product={r}/>)}
          </div>
        </section>)}
    </div>);
}
