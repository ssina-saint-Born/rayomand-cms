"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useState } from "react";
import Link from "next/link";
import { useStore } from "@/components/shop/StoreContext";
export default function CartPage() {
    const { t: tr } = useI18n();
    const { cart, money, updateQty, removeItem, applyCoupon, removeCoupon, settings } = useStore();
    const [code, setCode] = useState("");
    if (!cart)
        return <div className="shop-card h-64 animate-pulse bg-shop-border/40"/>;
    if (cart.items.length === 0) {
        return (<div className="shop-card p-14 text-center space-y-4">
        <svg className="mx-auto text-shop-purple" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <h1 className="text-2xl font-extrabold">{tr("Your cart is empty")}</h1>
        <p className="text-shop-muted">{tr("Browse the shop — the free downloads don't even need a cart.")}</p>
        <Link href="/collection" className="shop-btn shop-btn-primary">{tr("Return to shop")}</Link>
      </div>);
    }
    const t = cart.totals;
    return (<div className="space-y-6">
      <h1 className="text-3xl font-extrabold">{tr("Cart")}</h1>
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 shop-card overflow-x-auto">
          <table className="shop-table min-w-[540px]">
            <thead><tr><th>{tr("Product")}</th><th>{tr("Price")}</th><th>{tr("Quantity")}</th><th className="text-end">{tr("Subtotal")}</th><th /></tr></thead>
            <tbody>
              {cart.items.map((l) => (<tr key={`${l.product_id}-${l.variation_id}`}>
                  <td>
                    <div className="flex items-center gap-3">
                      {l.product.images?.[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={l.product.images[0].src} alt="" className="w-12 h-12 rounded object-cover"/>)}
                      <Link href={`/collection/items/${l.product.slug}`} className="font-semibold hover:text-shop-purple">{l.product.name}</Link>
                    </div>
                  </td>
                  <td>{money(l.unit_price)}</td>
                  <td>
                    <div className="inline-flex items-center border border-shop-border rounded-md">
                      <button className="px-2.5 py-1 font-bold text-shop-purple" onClick={() => updateQty(l.product_id, l.variation_id, l.quantity - 1)}>−</button>
                      <span className="w-8 text-center font-bold text-sm">{l.quantity}</span>
                      <button className="px-2.5 py-1 font-bold text-shop-purple" onClick={() => updateQty(l.product_id, l.variation_id, l.quantity + 1)}>+</button>
                    </div>
                  </td>
                  <td className="text-end font-bold">{money(l.line_subtotal)}</td>
                  <td><button className="text-shop-red font-bold hover:underline text-sm" onClick={() => removeItem(l.product_id, l.variation_id)}>{tr("Remove")}</button></td>
                </tr>))}
            </tbody>
          </table>
        </div>

        <div className="shop-card p-5 space-y-4">
          <h2 className="font-extrabold text-lg">{tr("Cart totals")}</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-shop-muted">{tr("Subtotal")}</span><span className="font-semibold">{money(t.subtotal)}</span></div>
            {t.discount_total > 0 && <div className="flex justify-between text-shop-green"><span>{tr("Coupon (")}{t.coupon_code})</span><span className="font-semibold">−{money(t.discount_total)}</span></div>}
            {t.needs_shipping && <div className="flex justify-between"><span className="text-shop-muted">{tr("Shipping")}</span><span className="font-semibold">{t.shipping_total === 0 ? tr("Free") : money(t.shipping_total)}</span></div>}
            {t.tax_total > 0 && <div className="flex justify-between"><span className="text-shop-muted">{tr("Tax")}</span><span className="font-semibold">{money(t.tax_total)}</span></div>}
            <div className="flex justify-between text-base font-extrabold border-t border-shop-border pt-2"><span>{tr("Total")}</span><span className="text-shop-purple">{money(t.total)}</span></div>
          </div>

          {settings?.enable_coupons ? (t.coupon_code ? (<div className="flex items-center justify-between text-sm bg-shop-green/10 rounded-md px-3 py-2">
                <span className="font-bold text-shop-green">{t.coupon_code} {" "}{tr("applied")}</span>
                <button className="text-shop-red font-semibold hover:underline" onClick={removeCoupon}>{tr("Remove")}</button>
              </div>) : (<form className="flex gap-2" onSubmit={async (e) => {
                e.preventDefault();
                if (await applyCoupon(code))
                    setCode("");
            }}>
                <input className="shop-input" placeholder={tr("Coupon code")} value={code} onChange={(e) => setCode(e.target.value)}/>
                <button className="shop-btn shop-btn-outline shop-btn-sm whitespace-nowrap">{tr("Apply")}</button>
              </form>)) : null}

          {settings?.disable_ecommerce ? (<p className="text-sm text-shop-muted">{tr("Checkout is disabled on this site.")}</p>) : (<Link href="/purchase" className="shop-btn shop-btn-primary w-full">{tr("Proceed to checkout")}</Link>)}
          <Link href="/collection" className="block text-center text-sm font-semibold text-shop-purple hover:underline">{tr("Continue shopping")}</Link>
        </div>
      </div>
    </div>);
}
