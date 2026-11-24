import { ok, fail, auth, readBody } from "@/lib/api";
import { getProductSmsTab, saveProductSmsTab, smsGroups, contactsMobile } from "@/lib/shop/sms-newsletter";
import { getSmsSettings } from "@/lib/shop/sms";
import { sendSms } from "@/lib/shop/sms-gateways-registry";
import { replaceProductTags } from "@/lib/shop/sms-tags";
import { SM_EVENTS } from "@/lib/shop/sms-events";
import { getProduct } from "@/lib/shop/products";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const id = Number(params.id);
    const product = await getProduct(id);
    if (!product)
        return fail("Product not found.", 404);
    return ok({ ...(await getProductSmsTab(id)), groups: await smsGroups(id, false, false) });
}
export async function PATCH(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    return ok(await saveProductSmsTab(Number(params.id), await readBody(req)));
}
// Product Tab's manual send: an arbitrary message to a chosen newsletter group.
export async function POST(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const id = Number(params.id);
    const product = await getProduct(id);
    if (!product)
        return fail("Product not found.", 404);
    const body = await readBody(req);
    const group = String(body.group || "");
    const isCustom = !["_onsale", "_in", "_low"].includes(group);
    if (!group)
        return fail("Choose a newsletter group.");
    const settings = await getSmsSettings();
    let receivers = await contactsMobile(id, group);
    if (product.parent_id)
        receivers = Array.from(new Set([...receivers, ...(await contactsMobile(product.parent_id, group))]));
    if (!receivers.length)
        return fail("This group has no subscribers.");
    const parent = product.parent_id ? (await getProduct(product.parent_id)) || product : product;
    const origin = new URL(req.url).origin;
    const message = await replaceProductTags(String(body.message || ""), product, parent, origin);
    if (!message.trim())
        return fail("The SMS text is empty.");
    const result = await sendSms({
        mobile: receivers, message,
        type: isCustom ? SM_EVENTS.NEWS_CUSTOM : (group === "_onsale" ? SM_EVENTS.NEWS_ONSALE_MANUAL : group === "_in" ? SM_EVENTS.NEWS_IN_STOCK_MANUAL : SM_EVENTS.NEWS_LOW_STOCK_MANUAL),
        post_id: id, post_type: "product", settings,
    });
    if (result !== true)
        return fail(typeof result === "string" ? result : "The SMS could not be sent.", 502);
    return ok({ sent: receivers.length });
}
