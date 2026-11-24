import { ok, fail, readBody } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { cartKey } from "@/lib/shop/cartKey";
import { cartLines, computeTotals } from "@/lib/shop/cart";
import { createOrder } from "@/lib/shop/orders";
import { getShopSettings } from "@/lib/shop/core";
import { getDownloadsSettings } from "@/lib/shop/core";
import { sendEmail } from "@/lib/shop/people";
import { dispatchOrderSms } from "@/lib/shop/sms-events";
import { checkoutAutoRegister, registrationMode, validateCheckoutPhone } from "@/lib/access/checkout-registration";
import { Mobile } from "@/lib/access/mobile";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
    const body = await readBody(req);
    const user = (await currentUser());
    const som = (await getDownloadsSettings());
    if (som.disable_ecommerce)
        return fail("Purchasing is disabled on this site. Free products can be downloaded directly.");
    const s = (await getShopSettings());
    if (!user && !s.enable_guest_checkout)
        return fail("You must be logged in to checkout.");
    const billing = body.billing || {};
    for (const f of ["first_name", "last_name", "email", "address_1", "city", "country"]) {
        if (!String(billing[f] || "").trim())
            return fail(`Billing ${f.replace("_", " ")} is required.`);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(billing.email)))
        return fail("Please enter a valid billing email address.");
    // Sentinel requires a valid Iranian mobile on every checkout.
    const phoneError = validateCheckoutPhone(billing.phone);
    if (phoneError)
        return fail(phoneError.message);
    // Store the canonical +98 form so orders, the customer profile and the
    // account record all agree on one mobile value.
    billing.phone = new Mobile(String(billing.phone)).getFormatted();

    // Sentinel auto-registration: only "yes_automatic" turns an anonymous shopper
    // into an account from their billing mobile. "yes_redirect" instead requires
    // sign-in before checkout (the access layer Integrations\Commerce\Redirect), and an
    // existing account must sign in rather than create a duplicate.
    let effectiveUser = user;
    if (!user) {
        const mode = await registrationMode();
        if (mode === "yes_redirect")
            return fail("You must be logged in to checkout.");
        if (mode === "yes_automatic") {
            const reg = await checkoutAutoRegister(billing);
            if (!reg.ok)
                return fail(reg.message);
            effectiveUser = (await currentUser());
        }
    }

    const key = cartKey();
    const lines = (await cartLines(key));
    if (!lines.length)
        return fail("Your cart is empty.");
    const totals = (await computeTotals(key, lines, {
        destination: body.ship_to_different ? body.shipping || {} : billing,
        shippingMethodId: body.shipping_method_id != null ? Number(body.shipping_method_id) : undefined,
        legacy: body.shipping_method ? String(body.shipping_method) : undefined,
    }));
    try {
        const order = (await createOrder({
            key, lines, totals,
            customerId: effectiveUser?.id || 0,
            billing,
            shipping: body.ship_to_different ? body.shipping || {} : billing,
            paymentMethod: String(body.payment_method || "cod"),
            customerNote: String(body.customer_note || ""),
            shippingMethod: String(body.shipping_method || ""),
            smsOptIn: body.sms_opt_in === undefined ? true : !!body.sms_opt_in,
            totalsContext: {
                destination: body.ship_to_different ? body.shipping || {} : billing,
                shippingMethodId: body.shipping_method_id != null ? Number(body.shipping_method_id) : undefined,
                legacy: body.shipping_method ? String(body.shipping_method) : undefined,
            },
        }));
        // Commerce runs both the "order created" and the "status changed"
        // hooks during checkout, so the plugin can emit two different texts.
        const origin = new URL(req.url).origin;
        await dispatchOrderSms({ orderId: order.id, trigger: "created", origin });
        if (order.status !== "created")
            await dispatchOrderSms({ orderId: order.id, trigger: "status", oldStatus: "created", newStatus: order.status, origin });
        let emailWarning: string | undefined;
        try { await sendEmail(billing.email, `Order #${order.number} received`, "Thank you for your order", `Your order #${order.number} for ${order.items.length} item(s) totalling ${order.total.toFixed(2)} has been received. Status: ${order.status}.`, "order"); }
        catch (error: any) { emailWarning = error.message; }
        return ok({ order, email_warning: emailWarning, registered: !user && !!effectiveUser }, 201);
    }
    catch (e: any) {
        return fail(e.message);
    }
}

