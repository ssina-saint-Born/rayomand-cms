"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { api } from "@/lib/client";
import { useStore } from "@/components/shop/StoreContext";
export default function OrderReceived() {
    const { t: tr, locale } = useI18n();
    const { id } = useParams<{
        id: string;
    }>();
    const sp = useSearchParams();
    const { money } = useStore();
    const [order, setOrder] = useState<any>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        const key = sp.get("key");
        api(`/api/storefront/orders/${id}${key ? `?key=${encodeURIComponent(key)}` : ""}`).then(setOrder)
            .catch((e) => setError(e.message));
    }, [id, sp]);
    if (error)
        return <div className="shop-card p-12 text-center text-shop-red font-semibold">{tr(error)}</div>;
    if (!order)
        return <div className="shop-card h-64 animate-pulse bg-shop-border/40"/>;
    return (<div className="space-y-6 max-w-3xl mx-auto">
      <div className="shop-card p-8 text-center border-t-4 border-t-shop-green">
        <div className="w-14 h-14 mx-auto rounded-full bg-shop-green/15 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4c6c57" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h1 className="text-2xl font-extrabold mt-3">{tr("Thank you. Your order has been received.")}</h1>
        <p className="text-shop-muted mt-1">{tr("Order recorded for")}{" "}{order.billing?.email}.</p>
        {sp.get("email_not_sent") === "1" && <p role="alert" className="text-sm text-shop-red mt-2">{tr("Your order was saved, but the confirmation email could not be sent.")}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 text-sm">
          <div className="shop-card p-3"><p className="text-shop-muted text-xs">{tr("Order number")}</p><p className="font-extrabold text-shop-purple">#{order.number}</p></div>
          <div className="shop-card p-3"><p className="text-shop-muted text-xs">{tr("Date")}</p><p className="font-bold">{new Date(order.created_at).toLocaleDateString(locale === "fa" ? "fa-IR" : "en-US")}</p></div>
          <div className="shop-card p-3"><p className="text-shop-muted text-xs">{tr("Total")}</p><p className="font-extrabold">{money(order.total)}</p></div>
          <div className="shop-card p-3"><p className="text-shop-muted text-xs">{tr("Payment")}</p><p className="font-bold">{tr(order.payment_method_title)}</p></div>
        </div>
      </div>

      <div className="shop-card p-5">
        <h2 className="font-extrabold text-lg mb-3">{tr("Order details")}</h2>
        <table className="shop-table">
          <thead><tr><th>{tr("Product")}</th><th className="text-end">{tr("Total")}</th></tr></thead>
          <tbody>
            {order.items.map((i: any) => (<tr key={i.id}><td>{i.name} × {i.quantity}</td><td className="text-end font-semibold">{money(i.total)}</td></tr>))}
            <tr><td className="text-shop-muted">{tr("Subtotal")}</td><td className="text-end">{money(order.items.reduce((a: number, i: any) => a + i.subtotal, 0))}</td></tr>
            {order.discount_total > 0 && <tr><td className="text-shop-green">{tr("Discount")}</td><td className="text-end text-shop-green">−{money(order.discount_total)}</td></tr>}
            {order.shipping_total > 0 && <tr><td className="text-shop-muted">{tr("Shipping")}</td><td className="text-end">{money(order.shipping_total)}</td></tr>}
            <tr><td className="font-extrabold">{tr("Total")}</td><td className="text-end font-extrabold text-shop-purple">{money(order.total)}</td></tr>
          </tbody>
        </table>
        <div className="grid sm:grid-cols-2 gap-4 mt-4 text-sm">
          <div><p className="font-bold mb-1">{tr("Billing address")}</p><p className="text-shop-muted">{order.billing.first_name} {order.billing.last_name}<br />{order.billing.address_1}<br />{order.billing.city}, {order.billing.postcode}<br />{order.billing.email}</p></div>
          {order.status && <div><p className="font-bold mb-1">{tr("Status")}</p><span className="shop-badge bg-shop-purple/10 text-shop-purple capitalize">{tr(order.status)}</span></div>}
        </div>
      </div>
      <div className="text-center"><Link href="/collection" className="shop-btn shop-btn-primary">{tr("Continue shopping")}</Link></div>
    </div>);
}
