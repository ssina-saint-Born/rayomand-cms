import { ok, auth, readBody } from "@/lib/api";
import { getSmsSettings, setSmsSettings, buyerStatusOptions, adminStatusOptions, SHORTCODE_GROUPS, EVENT_TYPES } from "@/lib/shop/sms";
import { gatewayOptions } from "@/lib/shop/sms-gateways-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    return ok({
        settings: (await getSmsSettings()),
        gateways: gatewayOptions(),
        buyerStatuses: buyerStatusOptions(),
        adminStatuses: adminStatusOptions(),
        shortcodes: SHORTCODE_GROUPS,
        events: EVENT_TYPES,
    });
}
export async function POST(req: Request) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    return ok({ settings: (await setSmsSettings(await readBody(req))) });
}
