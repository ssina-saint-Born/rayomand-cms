import { readBody } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { accessOk, accessFail } from "@/lib/access/api";
import { Identifier } from "@/lib/access/identifier";
import { isBlocked } from "@/lib/access/firewall";
import { getByMobile, setUserMobile, getMobile, updateUserMobileUsername } from "@/lib/access/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const user = await currentUser();
    if (!user)
        return accessFail("شما وارد نشده‌اید.");
    return accessOk(null, { mobile: (await getMobile(user.id)) || "" });
}

// Mirrors the access layer Integrations\Commerce\Account::validate_mobile_field() +
// save_mobile(): a valid, unblocked, unique mobile is required; changing it
// also renames the username (users are keyed by their mobile).
export async function POST(req: Request) {
    const user = await currentUser();
    if (!user)
        return accessFail("شما وارد نشده‌اید.");

    const body = await readBody(req);
    const raw = String(body.mobile ?? "").trim();
    if (!raw)
        return accessFail("لطفاً تلفن همراه خود را وارد نمایید.");

    const identifier = new Identifier(raw);
    if (!identifier.isMobile())
        return accessFail("لطفا یک تلفن همراه معتبر را ثبت کنید.");
    if (await isBlocked(identifier.getValue()))
        return accessFail("تلفن همراه وارد شده، مسدود می‌باشد.");

    const existing = await getByMobile(identifier.getValue());
    if (existing && existing.id !== user.id)
        return accessFail(`با تلفن همراه ${identifier.getValue()} یک حساب کاربری وجود دارد، لطفاً تلفن همراه دیگری وارد نمایید.`);

    const current = await getMobile(user.id);
    if (current === identifier.getValue())
        return accessOk("تلفن همراه تغییری نکرد.", { mobile: current });

    await setUserMobile(user.id, identifier.getValue());
    const target = identifier.getValue().replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
    await updateUserMobileUsername(user.id, target);

    return accessOk("تلفن همراه با موفقیت به‌روزرسانی شد. لطفاً با تلفن همراه جدید وارد شوید.", {
        mobile: identifier.getValue(),
    });
}
