import { readBody } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth";
import { guardAnonymous, accessOk, accessFail } from "@/lib/access/api";
import { toEnglishDigits } from "@/lib/access/number";
import { verifyOtp } from "@/lib/access/otp";
import { loginUser } from "@/lib/access/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    const denied = await guardAnonymous(req);
    if (denied)
        return denied;

    const body = await readBody(req);
    const jwt = String(body.jwt ?? "");
    const code = toEnglishDigits(String(body.code ?? "")).trim();

    if (!jwt)
        return accessFail("کد تایید معتبر نمی‌باشد.");
    if (!/^\d{4,6}$/.test(code))
        return accessFail("کد وارد شده نامعتبر است.");

    try {
        const userId = await verifyOtp(jwt, code);
        const token = await loginUser(userId, "otp");
        setSessionCookie(token);
        return accessOk("ورود با موفقیت انجام شد.", { user_id: userId });
    }
    catch (e) {
        return accessFail((e as Error).message);
    }
}
