import { getAccessOption } from "@/lib/access/settings";
import { Mobile } from "@/lib/access/mobile";
import { getByMobile, getByEmail, createByMobile, getOrCreateByMobile, loginUser } from "@/lib/access/users";
import { saveCustomerProfile } from "@/lib/shop/people";
import { setSessionCookie } from "@/lib/auth";

// Mirrors the access layer Integrations\Commerce\Load::registration_required() and the
// checkout_customer_id() auto-registration path.
export type RegistrationMode = "no" | "yes_redirect" | "yes_automatic";

export async function registrationMode(): Promise<RegistrationMode> {
    const v = String(await getAccessOption("general.commerce_checkout_registration_required", "no"));
    return v === "yes_redirect" || v === "yes_automatic" ? v : "no";
}

export async function isRegistrationRequired(): Promise<boolean> {
    return (await registrationMode()) !== "no";
}

export interface CheckoutPhoneError {
    code: "phone_required" | "phone_invalid";
    message: string;
}

// Mirrors Checkout::validate_checkout_phone().
export function validateCheckoutPhone(phone: unknown): CheckoutPhoneError | null {
    const raw = String(phone ?? "").trim();
    if (!raw)
        return { code: "phone_required", message: "لطفا شماره موبایل را وارد کنید." };
    if (!new Mobile(raw).isValid())
        return { code: "phone_invalid", message: "شماره موبایل وارد شده معتبر نمی‌باشد." };
    return null;
}

export interface AutoRegisterResult {
    userId: number;
    created: boolean;
}

// Mirrors Load::checkout_customer_id() for the "yes_automatic" mode: when the
// billing phone/email already belongs to an account, checkout must be blocked
// so the shopper signs in instead of creating a duplicate; otherwise a new
// account is created from the billing mobile and the shopper is signed in.
export async function checkoutAutoRegister(billing: Record<string, any>): Promise<
    { ok: true; result: AutoRegisterResult } | { ok: false; message: string }
> {
    const mobile = new Mobile(String(billing.phone ?? ""));
    if (!mobile.isValid())
        return { ok: false, message: "شماره موبایل وارد شده معتبر نمی‌باشد." };

    const existingMobile = await getByMobile(mobile.getFormatted());
    if (existingMobile) {
        return {
            ok: false,
            message: `یک حساب کاربری با تلفن همراه ${mobile.getFormatted()} وجود دارد، لطفاً وارد شوید.`,
        };
    }

    const email = String(billing.email ?? "").trim();
    if (email) {
        const existingEmail = await getByEmail(email);
        if (existingEmail) {
            return {
                ok: false,
                message: `یک حساب کاربری با ایمیل ${email} وجود دارد، لطفاً وارد شوید.`,
            };
        }
    }

    const userId = await createByMobile(mobile.getFormatted(), email);

    const first = String(billing.first_name ?? "").trim();
    const last = String(billing.last_name ?? "").trim();
    if (first || last) {
        const { updateUser } = await import("@/lib/users");
        await updateUser(userId, { display_name: `${first} ${last}`.trim() });
    }

    // Persist the billing details onto the customer profile so the order and
    // the "my account" page show the same data Commerce stored.
    const profileBilling = {
        first_name: first,
        last_name: last,
        company: String(billing.company ?? ""),
        email,
        phone: mobile.getFormatted(),
        address_1: String(billing.address_1 ?? ""),
        address_2: String(billing.address_2 ?? ""),
        city: String(billing.city ?? ""),
        state: String(billing.state ?? ""),
        postcode: String(billing.postcode ?? ""),
        country: String(billing.country ?? "IR"),
    };
    await saveCustomerProfile(userId, profileBilling, profileBilling);

    const token = await loginUser(userId, "checkout");
    setSessionCookie(token);

    return { ok: true, result: { userId, created: true } };
}

export { getOrCreateByMobile };
