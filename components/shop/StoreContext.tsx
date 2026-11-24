"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { ShopProduct } from "@/lib/shop/products";
export interface StoreSettings {
    currency: string;
    currency_pos: string;
    thousand_sep: string;
    decimal_sep: string;
    num_decimals: number;
    enable_coupons: number;
    calc_taxes: number;
    tax_rate: number;
    shipping_flat_cost: number;
    shipping_free_min: number;
    shipping_pickup: number;
    enable_guest_checkout: number;
    enable_reviews: number;
    review_rating_required: number;
    shop_columns: number;
    disable_ecommerce: number;
    enable_downloads: number;
    downloads: {
        button_text: string;
        link_text: string;
        badge_text: string;
        hide_badge: number;
        download_counts: number;
        include_archive_items: number;
        hide_readmore: number;
        owned_include: number;
        show_filename: number;
        file_list_text: string;
        display_single: string;
        display_multi: string;
        checkbox_error_text: string;
        button_class: string;
        button_css: string;
        link_class: string;
        link_css: string;
        capture_email_title: string;
        capture_email_title_bg: string;
        capture_email_title_colour: string;
        capture_email_placeholder: string;
        capture_email_button: string;
        capture_email_body: string;
        capture_email_subscribe: number;
        newsletter_enable: number;
        docviewer_enable: number;
        docviewer_link_text: string;
    };
    payments: {
        id: string;
        title: string;
        description: string;
    }[];
    categories: {
        id: number;
        name: string;
        slug: string;
    }[];
    tags: {
        id: number;
        name: string;
        slug: string;
    }[];
}
export interface CartLine {
    cart_key: string;
    product_id: number;
    variation_id: number;
    quantity: number;
    product: ShopProduct;
    unit_price: number;
    line_subtotal: number;
    line_total: number;
}
export interface CartView {
    key: string;
    items: CartLine[];
    count: number;
    totals: {
        subtotal: number;
        discount_total: number;
        shipping_total: number;
        tax_total: number;
        total: number;
        coupon_code: string | null;
        free_shipping: boolean;
        needs_shipping: boolean;
        shipping_method_id?: number;
        shipping_label?: string;
        shipping_zone?: string;
        shipping_tax?: number;
        tax_lines?: { name: string; rate: number; amount: number }[];
        available_shipping?: {
            method_id: number;
            zone_id: number;
            zone_name: string;
            method_type: string;
            label: string;
            cost: number;
        }[];
    };
}
interface StoreCtx {
    settings: StoreSettings | null;
    cart: CartView | null;
    notice: {
        type: "success" | "error";
        text: string;
    } | null;
    money: (n: number) => string;
    toast: (type: "success" | "error", text: string) => void;
    refreshCart: (shippingMethod?: string) => Promise<void>;
    addToCart: (productId: number, quantity?: number, variationId?: number) => Promise<boolean>;
    updateQty: (productId: number, variationId: number, quantity: number) => Promise<void>;
    removeItem: (productId: number, variationId: number) => Promise<void>;
    applyCoupon: (code: string) => Promise<boolean>;
    removeCoupon: () => Promise<void>;
}
const Ctx = createContext<StoreCtx>(null as any);
export const useStore = () => useContext(Ctx);
export function formatMoney(n: number, s: StoreSettings | null): string {
    if (!s)
        return `$${Number(n || 0).toFixed(2)}`;
    const dec = Number(s.num_decimals ?? 2);
    const [int, frac] = Math.abs(Number(n || 0)).toFixed(dec).split(".");
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, s.thousand_sep ?? ",");
    const body = dec > 0 ? `${grouped}${s.decimal_sep ?? "."}${frac}` : grouped;
    const sym = ({ USD: "$", EUR: "€", GBP: "£", JPY: "¥", AUD: "A$", CAD: "C$", INR: "₹" } as Record<string, string>)[s.currency] ?? `${s.currency} `;
    const sign = Number(n) < 0 ? "-" : "";
    if (s.currency_pos === "right")
        return `${sign}${body}${sym}`;
    if (s.currency_pos === "left_space")
        return `${sign}${sym} ${body}`;
    if (s.currency_pos === "right_space")
        return `${sign}${body} ${sym}`;
    return `${sign}${sym}${body}`;
}
export function StoreProvider({ children }: {
    children: React.ReactNode;
}) {
    const { t: tr } = useI18n();
    const [settings, setSettings] = useState<StoreSettings | null>(null);
    const [cart, setCart] = useState<CartView | null>(null);
    const [notice, setNotice] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);
    const refreshCart = useCallback(async (shippingMethod?: string) => {
        try {
            const c = await api<CartView>(`/api/storefront/cart${shippingMethod ? `?shipping_method=${shippingMethod}` : ""}`);
            setCart(c);
            window.dispatchEvent(new Event("wc-cart"));
        }
        catch { }
    }, []);
    useEffect(() => {
        api<StoreSettings>("/api/storefront/settings").then(setSettings).catch(() => { });
        refreshCart();
    }, [refreshCart]);
    useEffect(() => {
        if (!notice)
            return;
        const t = setTimeout(() => setNotice(null), 4200);
        return () => clearTimeout(t);
    }, [notice]);
    const toast = useCallback((type: "success" | "error", text: string) => setNotice({ type, text }), []);
    const money = useCallback((n: number) => formatMoney(n, settings), [settings]);
    const addToCart = useCallback(async (productId: number, quantity = 1, variationId = 0) => {
        try {
            const c = await api<CartView>("/api/storefront/cart", { method: "POST", body: JSON.stringify({ product_id: productId, quantity, variation_id: variationId }) });
            setCart(c);
            window.dispatchEvent(new Event("wc-cart"));
            setNotice({ type: "success", text: "Added to your cart." });
            return true;
        }
        catch (e: any) {
            setNotice({ type: "error", text: e.message });
            return false;
        }
    }, []);
    const updateQty = useCallback(async (productId: number, variationId: number, quantity: number) => {
        try {
            const c = await api<CartView>("/api/storefront/cart", { method: "PATCH", body: JSON.stringify({ product_id: productId, variation_id: variationId, quantity }) });
            setCart(c);
            window.dispatchEvent(new Event("wc-cart"));
        }
        catch (e: any) {
            setNotice({ type: "error", text: e.message });
        }
    }, []);
    const removeItem = useCallback(async (productId: number, variationId: number) => {
        const c = await api<CartView>(`/api/storefront/cart?product_id=${productId}&variation_id=${variationId}`, { method: "DELETE" });
        setCart(c);
        window.dispatchEvent(new Event("wc-cart"));
    }, []);
    const applyCoupon = useCallback(async (code: string) => {
        try {
            const c = await api<CartView>("/api/storefront/cart/coupon", { method: "POST", body: JSON.stringify({ code }) });
            setCart(c);
            window.dispatchEvent(new Event("wc-cart"));
            setNotice({ type: "success", text: `Coupon "${code}" applied.` });
            return true;
        }
        catch (e: any) {
            setNotice({ type: "error", text: e.message });
            return false;
        }
    }, []);
    const removeCoupon = useCallback(async () => {
        const c = await api<CartView>("/api/storefront/cart/coupon", { method: "DELETE" });
        setCart(c);
        window.dispatchEvent(new Event("wc-cart"));
    }, []);
    return (<Ctx.Provider value={{ settings, cart, notice, money, toast, refreshCart, addToCart, updateQty, removeItem, applyCoupon, removeCoupon }}>
      {children}
      {notice && (<div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] px-5 py-3 rounded-lg shadow-xl text-sm font-semibold text-white" role={notice.type === "success" ? "status" : "alert"} style={{ background: notice.type === "success" ? "#4c6c57" : "#975953", animation: "noma-reveal 200ms var(--noma-ease)" }}>
          {tr(notice.text)}
        </div>)}
    </Ctx.Provider>);
}
