import { readBody } from "@/lib/api";
import { auth } from "@/lib/api";
import { accessOk, accessFail } from "@/lib/access/api";
import { getAccessSection, setAccessSection, ACCESS_SECTIONS } from "@/lib/access/settings";
import { getGatewayOptions, setGatewayOption } from "@/lib/access/gateways";
import { Identifier } from "@/lib/access/identifier";
import { generateCode } from "@/lib/access/otp";
import { sendOtp, sendTestSms } from "@/lib/access/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GATEWAYS = ["logger", "kavenegar", "maxsms", "melipayamak", "iranpayamak", "panelchi", "pwsms"];

export async function GET() {
    const { res } = await auth("administrator");
    if (res)
        return res;

    const sections: Record<string, any> = {};
    for (const s of ACCESS_SECTIONS)
        sections[s] = await getAccessSection(s);

    const gateways: Record<string, any> = {};
    for (const g of GATEWAYS)
        gateways[g] = await getGatewayOptions(g);

    return accessOk(null, { sections, gateways });
}

export async function POST(req: Request) {
    const { res } = await auth("administrator");
    if (res)
        return res;

    const body = await readBody(req);
    const sections = body.sections || {};
    const gateways = body.gateways || {};

    const saved: Record<string, any> = {};
    for (const s of ACCESS_SECTIONS) {
        if (!(s in sections))
            continue;
        const patch = sections[s] || {};
        saved[s] = await setAccessSection(s, patch);
    }

    // Persist gateway credentials per gateway section.
    for (const g of GATEWAYS) {
        if (!(g in gateways))
            continue;
        await setGatewayOption(g, gateways[g] || {});
    }

    // Mirror the general registration options into the core options table.
    if (sections.general) {
        const { setOption } = await import("@/lib/options");
        if ("core_users_can_register" in sections.general)
            await setOption("users_can_register", sections.general.core_users_can_register ? "1" : "0");
        if ("core_default_role" in sections.general)
            await setOption("default_role", String(sections.general.core_default_role || "subscriber"));
    }

    return accessOk("تنظیمات با موفقیت ذخیره شد.", { saved });
}

export async function PUT(req: Request) {
    const { res } = await auth("administrator");
    if (res)
        return res;

    const body = await readBody(req);
    const action = String(body.action || "");

    if (action === "test_sms") {
        const identifier = new Identifier(String(body.identifier ?? ""));
        if (!identifier.isMobile())
            return accessFail("تلفن همراه معتبر نمی‌باشد.");
        const code = await generateCode();
        try {
            await sendTestSms(identifier.getValue(), code);
            return accessOk(`کد تایید «${code}» با موفقیت پیامک شد.`);
        }
        catch (e) {
            return accessFail((e as Error).message);
        }
    }

    if (action === "test_channel") {
        const identifier = new Identifier(String(body.identifier ?? ""));
        const channel = String(body.channel || "sms");
        if (!identifier.isValid())
            return accessFail("ایمیل یا تلفن همراه معتبر نمی‌باشد.");
        const code = await generateCode();
        try {
            const result = await sendOtp(0, identifier.getValue(), code, { [channel]: false });
            if (!result.sent.length)
                throw new Error("خطایی در زمان ارسال کد تایید رخ داده است.");
            return accessOk(`کد تایید «${code}» از طریق ${channel} ارسال شد.`);
        }
        catch (e) {
            return accessFail((e as Error).message);
        }
    }

    return accessFail("درخواست نامعتبر است.");
}
