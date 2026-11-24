import { getDb } from "../db";
import { getSmsSettings } from "./sms";
import { sendSms } from "./sms-gateways-registry";
import { SM_EVENTS } from "./sms-events";

// Archive::archive_table() screens.
export async function listArchive(q: { search?: string; type?: number; page?: number; perPage?: number } = {}) {
    const db = getDb();
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.search)
        where.push(`reciever LIKE $${params.push(`%${q.search}%`)}`);
    if (q.type)
        where.push(`type=$${params.push(q.type)}`);
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = Number((await db.one(`SELECT COUNT(*) c FROM sms_archive ${whereSql}`, ...params)).c);
    const perPage = Math.min(Number(q.perPage) || 20, 200);
    const page = Math.max(Number(q.page) || 1, 1);
    const items = await db.many(
        `SELECT * FROM sms_archive ${whereSql} ORDER BY id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        ...params, perPage, (page - 1) * perPage,
    );
    return { items, total, pages: Math.max(1, Math.ceil(total / perPage)) };
}

// delete_records_by_period(): day / week / month / all.
export async function deleteArchiveByPeriod(period: string): Promise<number> {
    const days: Record<string, number> = { day: 1, week: 7, month: 30 };
    if (period === "all") {
        const r = await getDb().execute("DELETE FROM sms_archive");
        return r.changes;
    }
    const d = days[period];
    if (!d)
        return 0;
    const since = new Date(Date.now() - d * 86400000).toISOString();
    const r = await getDb().execute("DELETE FROM sms_archive WHERE created_at < $1", since);
    return r.changes;
}

export async function deleteArchiveRows(ids: number[]): Promise<number> {
    if (!ids.length)
        return 0;
    const r = await getDb().execute("DELETE FROM sms_archive WHERE id = ANY($1::int[])", ids);
    return r.changes;
}

export async function archiveCsv(): Promise<string> {
    const rows = await getDb().many("SELECT id,post_id,type,reciever,message,sender,result,created_at FROM sms_archive ORDER BY id DESC");
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["id", "post_id", "type", "reciever", "message", "sender", "result", "created_at"];
    return [header.join(","), ...rows.map((r: any) => header.map((h) => esc(r[h])).join(","))].join("\n");
}

export async function contactsCsv(): Promise<string> {
    const rows = await getDb().many("SELECT c.id, c.product_id, p.name AS product_name, c.mobile, c.groups, c.created_at FROM sms_contacts c LEFT JOIN products p ON p.id=c.product_id ORDER BY c.id DESC");
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["id", "product_id", "product_name", "mobile", "groups", "created_at"];
    return [header.join(","), ...rows.map((r: any) => header.map((h) => esc(r[h])).join(","))].join("\n");
}

// Bulk::bulk_form() / SMSAPI::send() — the "send SMS" test screen.
export async function sendBulkSms(input: { mobile: string; message: string; type?: number }) {
    const settings = await getSmsSettings();
    const message = String(input.message ?? "");
    if (!message.trim())
        return { success: false as const, error: "The SMS text is empty.", count: 0 };
    const result = await sendSms({
        mobile: input.mobile, message, type: input.type ?? SM_EVENTS.BULK_SEND,
        post_id: 0, post_type: "", settings,
    });
    if (result === true) {
        const count = String(input.mobile || "").split(",").filter((m) => m.trim()).length;
        return { success: true as const, count };
    }
    return { success: false as const, error: result, count: 0 };
}

// Bulk::handle_bulk_actions() — collect the buyers' mobiles for selected orders.
export async function mobilesForOrders(orderIds: number[]): Promise<string> {
    if (!orderIds.length)
        return "";
    const rows = await getDb().many("SELECT billing FROM orders WHERE id = ANY($1::int[])", orderIds);
    const out = new Set<string>();
    for (const row of rows) {
        try {
            const billing = JSON.parse(row.billing || "{}");
            const phone = String(billing.phone || "").trim();
            if (phone)
                out.add(phone);
        }
        catch { /* ignore */ }
    }
    return Array.from(out).join(",");
}

export async function gatewayList() {
    const { gatewayOptions } = await import("./sms-gateways-registry");
    return gatewayOptions();
}
