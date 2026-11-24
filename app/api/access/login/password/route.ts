import { readBody } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth";
import { guardAnonymous, accessOk, accessFail } from "@/lib/access/api";
import { Identifier } from "@/lib/access/identifier";
import { isBlocked } from "@/lib/access/firewall";
import { matchIdentifier, getWithHashById, loginUser } from "@/lib/access/users";
import { hasPasswordMarker } from "@/lib/access/messages";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    const denied = await guardAnonymous(req);
    if (denied)
        return denied;

    const body = await readBody(req);
    const identifier = new Identifier(String(body.identifier ?? ""));
    const password = String(body.password ?? "");

    if (!identifier.isValid())
        return accessFail("ایمیل یا تلفن همراه معتبر نمی‌باشد.");
    if (!password)
        return accessFail("لطفا رمز عبور خود را وارد نمایید.");
    if (await isBlocked(identifier.getValue()))
        return accessFail("ایمیل یا تلفن همراه مسدود شده است.");

    const account = await matchIdentifier(identifier);
    if (!account)
        return accessFail("اطلاعات ورود معتبر نمی‌باشد.");

    const withHash = await getWithHashById(account.id);
    if (!withHash || !hasPasswordMarker(withHash.password_hash) || !verifyPassword(password, withHash.password_hash))
        return accessFail("اطلاعات ورود معتبر نمی‌باشد.");

    const token = await loginUser(account.id, "password");
    setSessionCookie(token);
    return accessOk("ورود با موفقیت انجام شد.", { user_id: account.id });
}
