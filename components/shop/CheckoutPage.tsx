"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { useStore } from "@/components/shop/StoreContext";
const EMPTY = { first_name: "", last_name: "", company: "", email: "", phone: "", address_1: "", address_2: "", city: "", state: "", postcode: "", country: "IR" };
function Field({ label, k, src, set, required, type = "text", half }: any) {
    const { t: tr } = useI18n();
    return (<label className={`block text-sm ${half ? "" : "sm:col-span-2"}`}>
      <span className="font-semibold text-shop-ink">{tr(label)}{required && <span className="text-shop-magenta"> *</span>}</span>
      <input className="shop-input mt-1" type={type} required={required} value={src[k]} onChange={(e) => set(k, e.target.value)}/>
    </label>);
}

interface GeoProvince { code: string; name: string; cityCount: number }
interface GeoCity { name: string; code: string }
interface ShipRate { method_id: number; zone_id: number; zone_name: string; method_type: string; label: string; cost: number }

function RegionFields({ src, set, country }: { src: any; set: (k: string, v: string) => void; country: string }) {
    const { t: tr } = useI18n();
    const [provinces, setProvinces] = useState<GeoProvince[]>([]);
    const [cities, setCities] = useState<GeoCity[]>([]);

    useEffect(() => {
        if (country !== "IR") { setProvinces([]); return; }
        api<{ provinces: GeoProvince[] }>("/api/storefront/geo").then((r) => setProvinces(r.provinces)).catch(() => { });
    }, [country]);

    useEffect(() => {
        if (country !== "IR" || !src.state) { setCities([]); return; }
        api<{ cities: GeoCity[] }>(`/api/storefront/geo?state=${encodeURIComponent(src.state)}`)
            .then((r) => setCities(r.cities)).catch(() => setCities([]));
    }, [country, src.state]);

    if (country !== "IR") {
        return (<>
          <Field label={tr("State / County")} k="state" src={src} set={set} half/>
          <Field label={tr("Town / City")} k="city" src={src} set={set} half/>
        </>);
    }

    return (<>
      <label className="block text-sm">
        <span className="font-semibold text-shop-ink">{tr("Province")}<span className="text-shop-magenta"> *</span></span>
        <select className="shop-input mt-1" value={src.state}
          onChange={(e) => { set("state", e.target.value); set("city", ""); }}>
          <option value="">{tr("Select a province…")}</option>
          {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-semibold text-shop-ink">{tr("City")}<span className="text-shop-magenta"> *</span></span>
        <select className="shop-input mt-1" value={src.city} disabled={!src.state}
          onChange={(e) => set("city", e.target.value)}>
          <option value="">{src.state ? tr("Select a city…") : tr("Choose a province first")}</option>
          {cities.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}
        </select>
      </label>
    </>);
}
export default function CheckoutPage() {
    const { t: tr } = useI18n();
    const { cart, money, settings, refreshCart } = useStore();
    const router = useRouter();
    const [billing, setBilling] = useState({ ...EMPTY });
    const [shipping, setShipping] = useState({ ...EMPTY });
    const [shipDifferent, setShipDifferent] = useState(false);
    const [payment, setPayment] = useState("cod");
    const [shipMethod, setShipMethod] = useState("flat");
    const [rateId, setRateId] = useState<number | null>(null);
    const [rates, setRates] = useState<ShipRate[]>([]);
    const [liveTotals, setLiveTotals] = useState<any>(null);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [loggedIn, setLoggedIn] = useState(false);
    useEffect(() => {
        api<{
            user: any;
            profile: any;
        }>("/api/storefront/account").then((a) => {
            setLoggedIn(true);
            setBilling((b) => ({ ...b, ...a.profile.billing, email: a.profile.billing?.email || a.user.email, first_name: a.profile.billing?.first_name || a.user.display_name }));
            if (a.profile.shipping?.address_1)
                setShipping((s) => ({ ...s, ...a.profile.shipping }));
        })
            .catch(() => { });
    }, []);
    useEffect(() => {
        if (cart?.totals.free_shipping && shipMethod !== "pickup")
            setShipMethod("free");
        else if (!cart?.totals.free_shipping && shipMethod === "free")
            setShipMethod("flat");
    }, [cart?.totals.free_shipping, shipMethod]);
    useEffect(() => { refreshCart(shipMethod); }, [shipMethod, refreshCart]);

    // Destination the buyer chose (shipping address when split, else billing).
    const dest = shipDifferent ? shipping : billing;
    // Re-price whenever the destination or chosen rate changes, so shipping and
    // tax reflect the selected province/city before the order is placed.
    useEffect(() => {
        if (!dest.state && !dest.country) return;
        const q = new URLSearchParams({
            country: dest.country || "IR",
            state: dest.state || "",
            city: dest.city || "",
            postcode: dest.postcode || "",
        });
        if (rateId) q.set("shipping_method_id", String(rateId));
        const timer = setTimeout(() => {
            api<any>(`/api/storefront/shipping-rates?${q.toString()}`)
                .then((r) => { setRates(r.totals.available_shipping || []); setLiveTotals(r.totals); })
                .catch(() => { });
        }, 250);
        return () => clearTimeout(timer);
    }, [dest.country, dest.state, dest.city, dest.postcode, rateId, shipDifferent, cart?.count]);

    // Auto-select the first available rate when the destination changes.
    useEffect(() => {
        if (!rates.length) { if (rateId !== null) setRateId(null); return; }
        if (rateId == null || !rates.some((r) => r.method_id === rateId)) setRateId(rates[0].method_id);
    }, [rates, rateId]);
    useEffect(() => {
        if (settings && !settings.payments.some(m => m.id === payment)) setPayment(settings.payments[0]?.id || "");
    }, [settings, payment]);
    if (!cart)
        return <div className="shop-card h-64 animate-pulse bg-shop-border/40"/>;
    if (settings?.disable_ecommerce) {
        return <div className="shop-card p-12 text-center space-y-3"><h1 className="text-xl font-extrabold">{tr("Checkout is disabled")}</h1><p className="text-shop-muted">{tr("This site has eCommerce turned off — free products can be downloaded directly from their product pages.")}</p><Link className="shop-btn shop-btn-primary" href="/collection">{tr("Back to shop")}</Link></div>;
    }
    if (cart.items.length === 0) {
        return <div className="shop-card p-12 text-center space-y-3"><h1 className="text-xl font-extrabold">{tr("Nothing to check out")}</h1><Link className="shop-btn shop-btn-primary" href="/collection">{tr("Browse products")}</Link></div>;
    }
    const t = liveTotals || cart.totals;
    const setB = (k: string, v: string) => setBilling((b) => ({ ...b, [k]: v }));
    const setS = (k: string, v: string) => setShipping((s) => ({ ...s, [k]: v }));
    async function placeOrder(e: React.FormEvent) {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            const r = await api<{
                order: any;
                email_warning?: string;
            }>("/api/storefront/checkout", {
                method: "POST",
                body: JSON.stringify({
                    billing, shipping, ship_to_different: shipDifferent, payment_method: payment, customer_note: note,
                    shipping_method_id: rateId ?? undefined,
                    shipping_method: rates.length ? undefined : shipMethod === "pickup" ? "pickup" : undefined,
                }),
            });
            await refreshCart();
            router.push(`/purchase/receipt/${r.order.id}?key=${encodeURIComponent(r.order.access_token)}${r.email_warning ? "&email_not_sent=1" : ""}`);
        }
        catch (err: any) {
            setError(err.message);
            setBusy(false);
        }
    }
    return (<form onSubmit={placeOrder} className="space-y-6">
      <h1 className="text-3xl font-extrabold">{tr("Checkout")}</h1>
      {!loggedIn && settings && !settings.enable_guest_checkout && (<div className="shop-card p-4 text-sm">{tr("Guest checkout is disabled.")}{" "}<Link href="/auth/sign-in" className="font-bold text-shop-purple underline">{tr("Log in")}</Link> {" "}{tr("to continue.")}</div>)}
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <div className="shop-card p-5">
            <h2 className="font-extrabold text-lg mb-4">{tr("Billing details")}</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label={tr("First name")} k="first_name" src={billing} set={setB} required half/>
              <Field label={tr("Last name")} k="last_name" src={billing} set={setB} required half/>
              <Field label={tr("Company (optional)")} k="company" src={billing} set={setB}/>
              <Field label={tr("Street address")} k="address_1" src={billing} set={setB} required/>
              <Field label={tr("Apartment, suite, etc. (optional)")} k="address_2" src={billing} set={setB}/>
              <RegionFields src={billing} set={setB} country={billing.country}/>
              <Field label={tr("Postcode / ZIP")} k="postcode" src={billing} set={setB} half/>
              <label className="block text-sm">
                <span className="font-semibold text-shop-ink">{tr("Country")}<span className="text-shop-magenta"> *</span></span>
                <select className="shop-input mt-1" value={billing.country} onChange={(e) => setB("country", e.target.value)}>
                  <option value="IR">{tr("Iran")}</option>
                  <option value="US">{tr("United States")}</option>
                  <option value="GB">{tr("United Kingdom")}</option>
                  <option value="DE">{tr("Germany")}</option>
                  <option value="AE">{tr("United Arab Emirates")}</option>
                </select>
              </label>
              <Field label={tr("Phone")} k="phone" src={billing} set={setB} type="tel" required half/>
              <Field label={tr("Email address")} k="email" src={billing} set={setB} required type="email" half/>
            </div>
            <label className="flex items-center gap-2 mt-4 text-sm font-semibold cursor-pointer">
              <input type="checkbox" checked={shipDifferent} onChange={(e) => setShipDifferent(e.target.checked)}/> {tr("Ship to a different address?")}</label>
            {shipDifferent && (<div className="grid sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-shop-border">
                <Field label={tr("First name")} k="first_name" src={shipping} set={setS} half/>
                <Field label={tr("Last name")} k="last_name" src={shipping} set={setS} half/>
                <Field label={tr("Street address")} k="address_1" src={shipping} set={setS}/>
                <RegionFields src={shipping} set={setS} country={shipping.country || billing.country}/>
                <Field label={tr("Postcode / ZIP")} k="postcode" src={shipping} set={setS} half/>
              </div>)}
          </div>

          <div className="shop-card p-5">
            <h2 className="font-extrabold text-lg mb-3">{tr("Additional information")}</h2>
            <label className="block text-sm font-semibold">{tr("Order notes (optional)")}<textarea className="shop-input mt-1" rows={3} placeholder={tr("Notes about your order, e.g. special notes for delivery.")} value={note} onChange={(e) => setNote(e.target.value)}/>
            </label>
          </div>
        </div>

        <div className="shop-card p-5 space-y-4">
          <h2 className="font-extrabold text-lg">{tr("Your order")}</h2>
          <div className="space-y-2 text-sm">
            {cart.items.map((l) => (<div key={`${l.product_id}-${l.variation_id}`} className="flex justify-between gap-2">
                <span className="text-shop-muted">{l.product.name} × {l.quantity}</span>
                <span className="font-semibold">{money(l.line_subtotal)}</span>
              </div>))}
            <div className="flex justify-between border-t border-shop-border pt-2"><span className="text-shop-muted">{tr("Subtotal")}</span><span className="font-semibold">{money(t.subtotal)}</span></div>
            {t.discount_total > 0 && <div className="flex justify-between text-shop-green"><span>{tr("Coupon (")}{t.coupon_code})</span><span>−{money(t.discount_total)}</span></div>}
            {t.needs_shipping && (<div className="space-y-1.5 border-t border-shop-border pt-2">
                <p className="font-semibold">{tr("Shipping")}</p>
                {rates.length > 0 ? (<>
                    {rates.map((r) => (<label key={r.method_id || r.label} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2">
                          <input type="radio" checked={rateId === r.method_id} onChange={() => setRateId(r.method_id)}/>
                          {" "}{r.label}{r.zone_name ? <span className="text-shop-muted"> · {r.zone_name}</span> : null}
                        </span>
                        <span className="font-semibold">{r.cost > 0 ? money(r.cost) : tr("Free")}</span>
                      </label>))}
                    {!dest.state && <p className="text-xs text-shop-muted">{tr("Choose your province and city to see shipping options.")}</p>}
                  </>) : (<>
                    {t.free_shipping ? (<label className="flex items-center gap-2 text-sm"><input type="radio" checked={shipMethod === "free"} onChange={() => setShipMethod("free")}/> {" "}{tr("Free shipping")}</label>) : (<label className="flex items-center gap-2 text-sm"><input type="radio" checked={shipMethod === "flat"} onChange={() => setShipMethod("flat")}/> {" "}{tr("Flat rate:")}{" "}{money(settings?.shipping_flat_cost || 0)}</label>)}
                    {settings?.shipping_pickup ? <label className="flex items-center gap-2 text-sm"><input type="radio" checked={shipMethod === "pickup"} onChange={() => setShipMethod("pickup")}/> {" "}{tr("Local pickup (free)")}</label> : null}
                  </>)}
              </div>)}
            {t.tax_total > 0 && (<>
                {(liveTotals?.tax_lines || []).length > 0
                    ? (liveTotals.tax_lines as { name: string; rate: number; amount: number }[]).map((tl, i) => (
                        <div key={`${tl.name}-${i}`} className="flex justify-between"><span className="text-shop-muted">{tl.name} ({tl.rate}%)</span><span>{money(tl.amount)}</span></div>))
                    : <div className="flex justify-between"><span className="text-shop-muted">{tr("Tax")}</span><span>{money(t.tax_total)}</span></div>}
              </>)}
            <div className="flex justify-between text-base font-extrabold border-t border-shop-border pt-2"><span>{tr("Total")}</span><span className="text-shop-purple">{money(t.total)}</span></div>
          </div>

          <div className="space-y-2 border-t border-shop-border pt-3">
            {(settings?.payments || []).map((m) => (<div key={m.id}>
                <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                  <input type="radio" name="payment" checked={payment === m.id} onChange={() => setPayment(m.id)}/> {tr(m.title)}
                </label>
                {payment === m.id && <p className="text-xs text-shop-muted ms-6 mt-1">{tr(m.description)}</p>}
              </div>))}
          </div>

          {error && <p className="text-sm font-semibold text-shop-red bg-shop-red/10 rounded-md px-3 py-2">{tr(error)}</p>}
          {t.total > 0 && !settings?.payments.length && <p role="alert" className="text-sm text-shop-red">{tr("No payment method is configured. Contact the store before placing an order.")}</p>}
          <button className="shop-btn shop-btn-primary w-full" disabled={busy || (t.total > 0 && !settings?.payments.length) || (!loggedIn && !!settings && !settings.enable_guest_checkout)}>{busy ? tr("Placing order…") : tr("Place order · {0}", {"0": String(money(t.total) ?? "")})}</button>
          <p className="text-[11px] text-shop-muted">{tr("Your personal data will be used to process your order and for other purposes described in our privacy policy.")}</p>
        </div>
      </div>
    </form>);
}
