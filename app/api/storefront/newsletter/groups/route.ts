import { ok, fail } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { getSmsSettings, maybeBool, modifyMobile, productSmsSetting } from "@/lib/shop/sms";
import { smsGroups } from "@/lib/shop/sms-newsletter";
import { getCustomerProfile } from "@/lib/shop/people";
import { getProduct } from "@/lib/shop/products";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Mirrors POST pwsms/notification/groups: the groups currently offered on a
// product page, plus whether the inline form should appear at all.
export async function GET(req: Request) {
    const p = new URL(req.url).searchParams;
    const productId = Number(p.get("product_id") || 0);
    if (!productId)
        return fail("Product ID is missing or invalid", 400);
    const product = await getProduct(productId);
    if (!product)
        return fail("Product not found.", 404);
    const settings = await getSmsSettings();
    if (!maybeBool(settings.enable_notif_sms_main))
        return ok({ enabled: false, groups: [], mode: "no", title: "", logged_in_only: false, login_text: "", logged_in: false, mobile: "" });
    const groups = await smsGroups(productId, true, true);
    const mode = String(await productSmsSetting(settings, "enable_notif_sms", productId) || "no");
    const user = await currentUser();
    let mobile = "";
    if (user) {
        const profile = await getCustomerProfile(user.id);
        mobile = modifyMobile(String((profile.billing as any)?.phone || ""));
    }
    return ok({
        enabled: true,
        groups: Object.entries(groups).map(([code, text]) => ({ code, text })),
        mode,
        title: await productSmsSetting(settings, "notif_title", productId),
        logged_in_only: maybeBool(await productSmsSetting(settings, "notif_only_loggedin", productId)),
        login_text: await productSmsSetting(settings, "notif_only_loggedin_text", productId),
        logged_in: !!user,
        mobile,
    });
}
