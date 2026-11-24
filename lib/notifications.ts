import { getDb, now } from "./db";
import { getSmsSettings } from "./shop/sms";
import { sendSms } from "./shop/sms-gateways-registry";

// Notification feed that the mobile app polls. Events are written here and
// delivered by pull (Android foreground service / iOS foreground poll). Swift
// critical events may also go out by SMS, but only if the operator has
// configured their own SMS provider — the CMS is never a provider itself.

export type NotificationLevel = "info" | "warning" | "critical";

export interface NotificationRow {
    id: number;
    user_id: number | null;
    kind: string;
    level: NotificationLevel;
    title: string;
    body: string;
    url: string;
    read_at: string | null;
    created_at: string;
}

export interface EmitInput {
    userId?: number | null;
    kind: string;
    title: string;
    body?: string;
    url?: string;
    level?: NotificationLevel;
    /** Collapses duplicates within the window; identical keys replace, not stack. */
    dedupeKey?: string;
    /** Send an SMS for this event if it is critical and a provider is set. */
    smsTo?: string;
    smsCritical?: boolean;
}

export async function emitNotification(input: EmitInput): Promise<number | null> {
    const db = getDb();
    // Dedupe: if an unread notification with the same key exists in the last
    // 15 minutes, refresh it instead of creating a duplicate.
    if (input.dedupeKey) {
        const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
        const existing = await db.one(
            `SELECT id FROM notifications
             WHERE dedupe_key=$1 AND created_at>$2 AND read_at IS NULL ${input.userId ? "AND user_id=$3" : ""}
             ORDER BY id DESC LIMIT 1`,
            ...(input.userId ? [input.dedupeKey, cutoff, input.userId] : [input.dedupeKey, cutoff]),
        );
        if (existing) {
            await db.execute("UPDATE notifications SET title=$1, body=$2, level=$3, created_at=$4, url=$5 WHERE id=$6",
                input.title, input.body || "", input.level || "info", now(), input.url || "", existing.id);
            return Number(existing.id);
        }
    }

    const id = (await db.execute(
        `INSERT INTO notifications (user_id,kind,level,title,body,url,dedupe_key,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        input.userId ?? null, input.kind, input.level || "info", input.title,
        input.body || "", input.url || "", input.dedupeKey || "", now(),
    )).id;

    if (input.smsCritical && input.smsTo && input.level === "critical") {
        // Fire-and-forget: a missing provider must not break the event, and the
        // result is recorded in the SMS archive for the operator to see.
        void (async () => {
            try {
                const settings = await getSmsSettings();
                if (settings?.sms_gateway && settings.sms_gateway !== "logger") {
                    await sendSms({ mobile: input.smsTo!, message: `[${input.title}] ${input.body || ""}`.slice(0, 320) });
                }
            }
            catch { /* recorded by the SMS layer when possible */ }
        })();
    }
    return id;
}

export async function listNotifications(opts: { userId?: number; since?: number; limit?: number }): Promise<NotificationRow[]> {
    const limit = Math.min(Math.max(opts.limit || 50, 1), 200);
    const where: string[] = [];
    const values: unknown[] = [];
    if (opts.userId) { values.push(opts.userId); where.push(`(user_id=$${values.length} OR user_id IS NULL)`); }
    if (opts.since) { values.push(opts.since); where.push(`id>$${values.length}`); }
    values.push(limit);
    const rows = await getDb().many(
        `SELECT id,user_id,kind,level,title,body,url,read_at,created_at FROM notifications
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY id DESC LIMIT $${values.length}`,
        ...values,
    );
    return rows as NotificationRow[];
}

export async function markNotificationsRead(ids: number[], userId?: number): Promise<number> {
    if (!ids.length)
        return 0;
    const params: unknown[] = [now(), ...ids];
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(",");
    let sql = `UPDATE notifications SET read_at=$1 WHERE read_at IS NULL AND id IN (${placeholders})`;
    // Broadcast notifications (user_id NULL) are shared; marking one read
    // applies to the feed. Personal ones may only be touched by their owner.
    if (userId) { params.push(userId); sql += ` AND (user_id=$${params.length} OR user_id IS NULL)`; }
    const result = await getDb().execute(sql, ...params);
    return result.changes;
}

export async function unreadCount(userId?: number): Promise<number> {
    const row = userId
        ? await getDb().one("SELECT count(*)::int AS n FROM notifications WHERE read_at IS NULL AND (user_id=$1 OR user_id IS NULL)", userId)
        : await getDb().one("SELECT count(*)::int AS n FROM notifications WHERE read_at IS NULL");
    return Number(row?.n || 0);
}
