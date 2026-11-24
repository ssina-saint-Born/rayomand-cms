import { readBody, auth } from "@/lib/api";
import { accessOk, accessFail } from "@/lib/access/api";
import { Identifier } from "@/lib/access/identifier";
import { block, deleteBlock, listBlocks } from "@/lib/access/firewall";
import { getByUsername } from "@/lib/access/users";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mirrors BlocksAPI::expand_identifier(): a valid IP is used verbatim, a
// username must resolve to an existing account (blocked by its login), and
// emails/mobiles are stored in their canonical form.
async function expandIdentifier(raw: string): Promise<string | null> {
    const value = String(raw || "").trim();
    if (!value)
        return null;

    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6 = /^[0-9a-fA-F:]+$/;
    if (ipv4.test(value)) {
        const parts = value.split(".").map(Number);
        if (parts.every((p) => p >= 0 && p <= 255))
            return value;
    }
    else if (ipv6.test(value) && value.includes(":")) {
        return value;
    }

    const identifier = new Identifier(value);
    if (!identifier.isValid())
        return null;

    if (identifier.getType() === "username") {
        const user = await getByUsername(identifier.getValue());
        return user ? user.username : null;
    }
    return identifier.getValue();
}

function resource(row: any) {
    return {
        id: row.id,
        identifier: row.identifier,
        blocked_by: row.blocked_by,
        blocked_by_label: null as string | null,
        blocked_until: row.blocked_until || null,
        created_at: row.created_at,
        is_system: row.blocked_by === null,
    };
}

export async function GET(req: Request) {
    const { res } = await auth("administrator");
    if (res)
        return res;

    const url = new URL(req.url);
    const q = url.searchParams;
    const page = Math.max(Number(q.get("page") || 1), 1);
    const perPage = Math.min(Math.max(Number(q.get("per_page") || 20), 1), 200);

    const result = await listBlocks({
        identifier: q.get("identifier") || undefined,
        fromDate: q.get("from_date") || undefined,
        toDate: q.get("to_date") || undefined,
        blockedBy: q.get("blocked_by") || undefined,
        page,
        perPage,
    });

    const blocks = await Promise.all(result.blocks.map(async (row) => {
        const item = resource(row);
        if (row.blocked_by) {
            const u = await getDb().one("SELECT display_name FROM users WHERE id=$1", row.blocked_by);
            item.blocked_by_label = u ? String(u.display_name) : null;
        }
        return item;
    }));

    return accessOk(null, {
        blocks,
        current_page: result.current_page,
        total_items: result.total_items,
        per_page: perPage,
    });
}

export async function POST(req: Request) {
    const { user, res } = await auth("administrator");
    if (res)
        return res;

    const body = await readBody(req);
    const action = String(body.action || "add");

    if (action === "filters") {
        const admins = await getDb().many("SELECT id, display_name FROM users WHERE role IN ('administrator','editor') ORDER BY display_name");
        return accessOk(null, { users: admins.map((u: any) => ({ id: u.id, label: u.display_name })) });
    }

    if (action === "add") {
        let blockedUntil: string | null = null;
        if (body.blocked_until) {
            const when = new Date(String(body.blocked_until));
            if (isNaN(when.getTime()))
                return accessFail("تاریخ مسدودیت معتبر نمی‌باشد.");
            if (when.getTime() <= Date.now())
                return accessFail("تاریخ مسدودیت باید در آینده باشد.");
            blockedUntil = when.toISOString();
        }

        const identifier = await expandIdentifier(String(body.identifier ?? ""));
        if (!identifier)
            return accessFail("شناسه وارد شده معتبر نمی‌باشد.");

        const minutes = blockedUntil ? Math.max(1, Math.round((new Date(blockedUntil).getTime() - Date.now()) / 60000)) : null;
        const row = await block(identifier, minutes, user!.id);
        return accessOk(`شناسه ${identifier} با موفقیت مسدود شد.`, { block: resource(row) });
    }

    if (action === "delete") {
        const id = Number(body.block_id);
        if (!id)
            return accessFail("شناسه مسدودی معتبر نمی‌باشد.");
        const ok = await deleteBlock(id);
        if (!ok)
            return accessFail("مسدودی‌های سیستمی قابل حذف نیستند.");
        return accessOk("شناسه با موفقیت رفع مسدودی شد.");
    }

    return accessFail("درخواست نامعتبر است.");
}
