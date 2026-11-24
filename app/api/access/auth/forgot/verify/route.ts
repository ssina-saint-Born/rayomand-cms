import { readBody } from "@/lib/api";
import { guardAnonymous, accessOk, accessFail } from "@/lib/access/api";
import { toEnglishDigits } from "@/lib/access/number";
import { verifyOtp } from "@/lib/access/otp";
import { issuePasswordResetKey } from "@/lib/access/users";
import { jwtEncode } from "@/lib/access/jwt";

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
        const resetKey = await issuePasswordResetKey(userId);
        return accessOk(null, {
            jwt: jwtEncode({ user_id: userId }, 3600),
            reset_key: resetKey,
        });
    }
    catch (e) {
        return accessFail((e as Error).message);
    }
}
