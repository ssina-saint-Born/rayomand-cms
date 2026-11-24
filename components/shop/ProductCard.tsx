"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useState } from "react";
import Link from "next/link";
import { useStore } from "./StoreContext";
import Stars from "./Stars";
import FreeDownloadButton from "./FreeDownloadButton";
import type { ShopProduct } from "@/lib/shop/products";
export default function ProductCard({ product }: {
    product: ShopProduct;
}) {
    const { t: tr } = useI18n();
    const { money, addToCart, settings } = useStore();
    const [busy, setBusy] = useState(false);
    const som = settings?.downloads;
    const img = product.images?.[0]?.src;
    const isFree = product.free_download;
    const showArchiveDownload = isFree && som?.include_archive_items;
    const ecommerceOff = !!settings?.disable_ecommerce;
    async function add() {
        setBusy(true);
        await addToCart(product.id, 1);
        setBusy(false);
    }
    return (<div className="shop-card noma-product-card overflow-hidden flex flex-col group">
      <Link href={`/collection/items/${product.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-shop-bg">
        {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={product.images?.[0]?.alt || product.name} className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"/>) : (<div className="w-full h-full flex items-center justify-center text-shop-muted text-sm">{tr("No image")}</div>)}
        <div className="absolute top-2 start-2 flex gap-1.5">
          {isFree && !som?.hide_badge && <span className="shop-badge bg-shop-green text-white">{tr(som?.badge_text || tr("Free"))}</span>}
          {product.on_sale && <span className="shop-badge bg-shop-magenta text-white">{tr("Sale")}</span>}
          {product.featured ? <span className="shop-badge bg-shop-amber text-shop-ink">{tr("Featured")}</span> : null}
          {product.stock_status === "outofstock" && <span className="shop-badge bg-shop-red text-white">{tr("Sold out")}</span>}
        </div>
      </Link>
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-shop-muted font-semibold">{product.categories?.[0]?.name || tr("Product")}</div>
        <Link href={`/collection/items/${product.slug}`} className="font-bold text-shop-ink leading-snug hover:text-shop-purple">{product.name}</Link>
        {product.rating_count > 0 && <Stars rating={product.average_rating} count={product.rating_count}/>}
        <div className="mt-auto pt-1">
          {isFree ? (<div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-shop-green">{money(0)}</span>
              {showArchiveDownload ? (<FreeDownloadButton product={product} compact/>) : !som?.hide_readmore && settings?.enable_downloads ? (<Link href={`/collection/items/${product.slug}`} className="shop-btn shop-btn-free shop-btn-sm">{tr("Read more")}</Link>) : null}
            </div>) : (<div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-shop-ink">
                {product.on_sale && <span className="text-shop-muted line-through font-normal text-sm me-1.5">{money(product.regular_price || 0)}</span>}
                {money(product.price || 0)}
              </span>
              {!ecommerceOff && product.stock_status !== "outofstock" && product.type !== "grouped" && product.type !== "external" && (product.type === "variable" ? (<Link href={`/collection/items/${product.slug}`} className="shop-btn shop-btn-primary shop-btn-sm">{tr("Select options")}</Link>) : (<button className="shop-btn shop-btn-primary shop-btn-sm" disabled={busy} onClick={add}>
                    {busy ? tr("Adding…") : tr("Add to cart")}
                  </button>))}
            </div>)}
        </div>
      </div>
    </div>);
}
