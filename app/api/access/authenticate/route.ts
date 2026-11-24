import { readBody } from "@/lib/api";
import { guardAnonymous, accessOk, accessFail } from "@/lib/access/api";
import { Identifier } from "@/lib/access/identifier";
import { isBlocked } from "@/lib/access/firewall";
import { matchIdentifier, getWithHashById, getLoginMethod } from "@/lib/access/users";
import { getChannels } from "@/lib/access/channels";
import { createOtp, findCurrentOtp, OTP_TYPE_FORGET, OTP_TYPE_LOGIN, OTP_TYPE_REGISTER } from "@/lib/access/otp";
import { hasPasswordMarker, otpSentMessage } from "@/lib/access/messages";
import { jwtEncode, DEFAULT_TTL } from "@/lib/access/jwt";
import { getAccessOption, accessUsersCanRegister } from "@/lib/access/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOriginBack(req: Request, candidate: unknown): string {
    const origin = new URL(req.url).origin;
    if (typeof candidate === "string" && candidate) {
        try {
            const u = new URL(candidate, origin);
            if (u.origin === origin)
                return u.pathname + u.search;
        }
        catch { /* ignore */ }
    }
    return "/";
}

export async function POST(req: Request) {
    const denied = await guardAnonymous(req);
    if (denied)
        return denied;

    const body = await readBody(req);
    const identifier = new Identifier(String(body.identifier ?? ""));
    if (!identifier.isValid())
        return accessFail("ایمیل یا تلفن همراه معتبر نمی‌باشد.");
    if (await isBlocked(identifier.getValue()))
        return accessFail("ایمیل یا تلفن همراه مسدود شده است.");

    const forceOtpParam = !!body.force_otp;
    const forget = !!body.forget;
    // Mirrors UserAPI::authenticate(): $force_otp = $force_otp || $forget.
    const forceOtp = forceOtpParam || forget;

    const data: Record<string, any> = {
        has_password: false,
        has_account: false,
        login_method: "otp",
        ttl: DEFAULT_TTL,
    };

    const account = await matchIdentifier(identifier);
    let message: string | null = null;

    if (account) {
        data.has_account = true;
        const withHash = await getWithHashById(account.id);
        data.has_password = hasPasswordMarker(withHash?.password_hash);

        if (identifier.isEmail() || identifier.isUsername())
            data.login_method = "password";
        if ((await getLoginMethod(account.id)) === "password")
            data.login_method = "password";
        if (data.has_password && (await getAccessOption("advanced.default_login_method", "otp")) === "password")
            data.login_method = "password";
    }
    else if (forget) {
        return accessFail("حساب کاربری یافت نشد.");
    }
    else if (!(await accessUsersCanRegister())) {
        return accessFail("عضویت در سایت غیرفعال است.");
    }
    else if (identifier.isEmail()) {
        return accessFail("حساب کاربری با این ایمیل وجود ندارد. برای عضویت از تلفن همراه استفاده کنید.");
    }

    if (forceOtp || forget)
        data.login_method = "otp";

    if (data.login_method === "otp") {
        if (identifier.isUsername())
            return accessFail("برای دریافت کد تایید، از تلفن همراه یا ایمیل استفاده کنید.");

        const current = await findCurrentOtp(identifier.getValue());

        if (current) {
            const ttl = Math.floor((new Date(current.expires_at).getTime() - Date.now()) / 1000);

            if (current.verified_at) {
                if (forceOtp)
                    return accessFail(`برای دریافت کد تایید ${ttl} ثانیه دیگر تلاش کنید.`);
                if (data.has_password)
                    data.login_method = "password";
            }
            else {
                data.ttl = ttl;
                data.jwt = jwtEncode({ otp_id: current.id }, ttl);
            }

            const sent: string[] = [];
            try {
                const parsed = JSON.parse(current.channels || "{}");
                for (const [k, v] of Object.entries(parsed))
                    if (v === true)
                        sent.push(k);
            }
            catch { /* ignore */ }
            message = sent.length ? otpSentMessage(sent, identifier, !!account) : null;
        }
        else {
            try {
                let type: string = OTP_TYPE_REGISTER;
                if (account) {
                    type = OTP_TYPE_LOGIN;
                    if (forget)
                        type = OTP_TYPE_FORGET;
                }
                const channels = await getChannels(identifier.getValue(), identifier.isMobile());
                const [jwt, successful] = await createOtp(identifier, channels, type, account?.id ?? null);
                data.jwt = jwt;
                message = otpSentMessage(successful, identifier, !!account);
            }
            catch (e) {
                const err = e as Error;
                if (forceOtp)
                    return accessFail(err.message);
                if (data.has_password)
                    data.login_method = "password";
                else
                    return accessFail(err.message);
            }
        }
    }

    return accessOk(message, data, { back_url: sameOriginBack(req, body.back_url) });
}
