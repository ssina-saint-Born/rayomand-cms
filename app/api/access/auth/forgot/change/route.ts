import { readBody } from "@/lib/api";
import { setSessionCookie } from "@/lib/auth";
import { guardAnonymous, accessOk, accessFail } from "@/lib/access/api";
import { jwtDecode } from "@/lib/access/jwt";
import { validatePassword } from "@/lib/access/password";
import { checkPasswordResetKey, consumePasswordResetKey, getWithHashById, loginUser } from "@/lib/access/users";
import { hashPassword } from "@/lib/password";
import { updateUser } from "@/lib/users";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    const denied = await guardAnonymous(req);
    if (denied)
        return denied;

    const body = await readBody(req);
    const jwt = String(body.jwt ?? "");
    const resetKey = String(body.reset_key ?? "");
    const password1 = String(body.password_1 ?? "");
    const password2 = String(body.password_2 ?? "");

    if (password1 !== password2)
        return accessFail("رمز عبور و تکرار رمز عبور یکسان نیستند.");
    if (!resetKey)
        return accessFail("کلید بازنشانی نامعتبر است.");

    const check = validatePassword(password1);
    if (!check.valid)
        return accessFail("رمزعبور ضعیف است.", { errors: check.errors });

    let userId: number;
    try {
        const payload = jwtDecode(jwt);
        if (!payload.user_id)
            throw new Error("no user");
        userId = Number(payload.user_id);
    }
    catch {
        return accessFail("حساب کاربری معتبر نمی‌باشد.");
    }

    const user = await getWithHashById(userId);
    if (!user)
        return accessFail("حساب کاربری معتبر نمی‌باشد.");
    if (!(await checkPasswordResetKey(userId, resetKey)))
        return accessFail("کلید بازنشانی نامعتبر است یا منقضی شده است.");

    await updateUser(userId, { password_hash: hashPassword(password1) });
    await consumePasswordResetKey(userId);
    // Invalidate any other live sessions so a stolen cookie cannot survive a reset.
    await getDb().execute("DELETE FROM sessions WHERE user_id=$1", userId);

    const token = await loginUser(userId, "password");
    setSessionCookie(token);
    return accessOk("رمزعبور با موفقیت بازنشانی شد و به سیستم وارد شدید.", { user_id: userId });
}
