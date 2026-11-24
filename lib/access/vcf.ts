import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/options";
import { getMobile, getUserMeta } from "@/lib/access/users";
import { Mobile } from "@/lib/access/mobile";
import { getAccessOption } from "@/lib/access/settings";
import type { ExportUser } from "./export-users";

// Mirrors the core integration\Exports\VCF::generate() (vCard 3.0).

const ROLE_LABELS: Record<string, string> = {
    administrator: "مدیر",
    editor: "ویرایشگر",
    author: "نویسنده",
    contributor: "مشارکت‌کننده",
    subscriber: "مشترک",
    customer: "مشتری",
};

function vesc(value: string): string {
    return String(value || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function billingOf(userId: number): Promise<any> {
    return getDb().one("SELECT billing FROM customer_profiles WHERE user_id=$1", userId)
        .then((row) => {
            if (!row)
                return {};
            try {
                return JSON.parse(row.billing || "{}");
            }
            catch {
                return {};
            }
        });
}

export async function buildVcf(users: ExportUser[], origin: string): Promise<string> {
    const settings = await getSettings();
    const siteName = settings.site_title || "سایت";
    const metaKeysRaw = String(await getAccessOption("advanced.mobile_possible_meta_keys", ""));
    const metaKeys = metaKeysRaw.split(/\r?\n/).map((k) => k.trim()).filter(Boolean);

    const cards: string[] = [];

    for (const u of users) {
        const billing = await billingOf(u.id);

        const mobiles = new Set<string>();
        const primary = u.mobile || (await getMobile(u.id));
        if (primary)
            mobiles.add(primary);
        for (const key of metaKeys) {
            const raw = await getUserMeta(u.id, key);
            if (!raw)
                continue;
            const m = new Mobile(String(raw));
            if (m.isValid())
                mobiles.add(m.getFormatted());
        }

        const fullName = u.display_name || u.username;
        const lines: string[] = [
            "BEGIN:VCARD",
            "VERSION:3.0",
            `N:;${vesc(fullName)};;;`,
            `FN:${vesc(fullName)}`,
            `ORG:${vesc(billing.company ? `${billing.company};${siteName}` : siteName)}`,
        ];

        let i = 0;
        for (const mobile of Array.from(mobiles)) {
            const type = i === 0 ? "CELL" : `X-PHONE${i}`;
            lines.push(`TEL;TYPE=${type}:${mobile}`);
            i++;
        }

        if (u.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email) && !u.email.endsWith("@access.local"))
            lines.push(`EMAIL;TYPE=INTERNET:${u.email}`);

        const addr = [billing.address_1, billing.city, billing.state, billing.postcode, billing.country === "IR" ? "ایران" : billing.country]
            .map((v) => vesc(String(v || "")));
        if (billing.address_1 || billing.city)
            lines.push(`ADR;TYPE=HOME:;;${addr[0]};${addr[1]};${addr[2]};${addr[3]};${addr[4]}`);

        lines.push(`URL;TYPE=WORK:${origin}`);
        lines.push(`X-SITE:${origin}`);
        lines.push(`X-RM-USERNAME:${vesc(u.username)}`);
        lines.push(`X-RM-ID:${u.id}`);
        lines.push(`X-RM-Roles:${ROLE_LABELS[u.role] || u.role}`);
        if (u.created_at)
            lines.push(`X-RM-Registered:${u.created_at.slice(0, 10)}`);

        const note: string[] = [];
        if (u.created_at)
            note.push(`زمان ثبت نام: ${u.created_at.slice(0, 10)}`);
        note.push(`نقش کاربر: ${ROLE_LABELS[u.role] || u.role}`);
        note.push(`نام کاربری: ${u.username}`);
        note.push(`نام نمایشی: ${u.display_name}`);
        note.push(`شناسه کاربر: ${u.id}`);
        lines.push(`NOTE:${note.map(vesc).join("\\n")}`);

        lines.push("END:VCARD");
        cards.push(lines.join("\r\n"));
    }

    return cards.join("\r\n");
}
