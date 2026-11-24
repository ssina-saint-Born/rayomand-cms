import { ok, auth, fail } from "@/lib/api";
import { listCustomers } from "@/lib/shop/people";
import { createByMobile, getByMobile, getByEmail } from "@/lib/access/users";
import { saveCustomerProfile } from "@/lib/shop/people";
import { Mobile } from "@/lib/access/mobile";
import { updateUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const search = new URL(req.url).searchParams.get("search") || undefined;
    return ok({ items: (await listCustomers({ search })) });
}

// Admin-side customer creation: creates an account from a mobile (and optional
// name/email), seeding the billing profile. Mirrors the plugin's admin
// "create customer" action.
export async function POST(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const body = await req.json().catch(() => ({}));
    const mobile = new Mobile(String(body.phone ?? ""));
    if (!mobile.isValid())
        return fail("شماره موبایل وارد شده معتبر نمی‌باشد.");
    if (await getByMobile(mobile.getFormatted()))
        return fail("حسابی با این شماره موبایل از قبل وجود دارد.");
    const email = String(body.email ?? "").trim();
    if (email && (await getByEmail(email)))
        return fail("حسابی با این ایمیل از قبل وجود دارد.");

    const userId = await createByMobile(mobile.getFormatted(), email);
    const first = String(body.first_name ?? "").trim();
    const last = String(body.last_name ?? "").trim();
    if (first || last)
        await updateUser(userId, { display_name: `${first} ${last}`.trim() });

    await saveCustomerProfile(userId, {
        first_name: first,
        last_name: last,
        company: String(body.company ?? ""),
        email,
        phone: mobile.getFormatted(),
        address_1: String(body.address_1 ?? ""),
        address_2: String(body.address_2 ?? ""),
        city: String(body.city ?? ""),
        state: String(body.state ?? ""),
        postcode: String(body.postcode ?? ""),
        country: String(body.country ?? "IR"),
    }, {});

    return ok({ id: userId });
}
