import { randomUUID } from "node:crypto";
import { readFile, unlink, stat, writeFile } from "node:fs/promises";
import { getDb, now, withTransaction } from "../../db";
import { messagePath, resolveStored } from "./paths";
import type { MailAddress } from "./address";
import { formatAddressList } from "./address";

// Message store. Bodies are files; SQL holds only what a listing or a search
// needs. UID allocation is done inside a transaction that locks the folder row
// so two concurrent deliveries cannot receive the same UID.

export const SPECIAL_USE = {
    inbox: "\\Inbox",
    sent: "\\Sent",
    drafts: "\\Drafts",
    trash: "\\Trash",
    junk: "\\Junk",
    archive: "\\Archive",
} as const;

export interface MailFolder {
    id: number;
    account_id: number;
    name: string;
    special_use: string;
    uidvalidity: number;
    uidnext: number;
    subscribed: boolean;
    created_at: string;
}

export interface StoredMessage {
    id: number;
    account_id: number;
    folder_id: number;
    uid: number;
    message_id: string;
    in_reply_to: string;
    thread_refs: string;
    sender_name: string;
    sender_addr: string;
    to_addrs: string;
    cc_addrs: string;
    bcc_addrs: string;
    reply_to: string;
    subject: string;
    sent_at: string;
    size: number;
    raw_path: string;
    snippet: string;
    has_attachments: boolean;
    seen: boolean;
    flagged: boolean;
    answered: boolean;
    draft: boolean;
    deleted: boolean;
    recent: boolean;
    spam_score: number;
    auth_results: string;
    created_at: string;
}

const DEFAULT_FOLDERS: Array<{ name: string; special: string }> = [
    { name: "INBOX", special: SPECIAL_USE.inbox },
    { name: "Sent", special: SPECIAL_USE.sent },
    { name: "Drafts", special: SPECIAL_USE.drafts },
    { name: "Trash", special: SPECIAL_USE.trash },
    { name: "Junk", special: SPECIAL_USE.junk },
    { name: "Archive", special: SPECIAL_USE.archive },
];

export function normalizeFolder(row: any): MailFolder {
    return {
        id: Number(row.id),
        account_id: Number(row.account_id),
        name: String(row.name),
        special_use: String(row.special_use || ""),
        uidvalidity: Number(row.uidvalidity),
        uidnext: Number(row.uidnext),
        subscribed: !!row.subscribed,
        created_at: String(row.created_at),
    };
}

export function normalizeMessage(row: any): StoredMessage {
    return {
        id: Number(row.id),
        account_id: Number(row.account_id),
        folder_id: Number(row.folder_id),
        uid: Number(row.uid),
        message_id: String(row.message_id || ""),
        in_reply_to: String(row.in_reply_to || ""),
        thread_refs: String(row.thread_refs || ""),
        sender_name: String(row.sender_name || ""),
        sender_addr: String(row.sender_addr || ""),
        to_addrs: String(row.to_addrs || ""),
        cc_addrs: String(row.cc_addrs || ""),
        bcc_addrs: String(row.bcc_addrs || ""),
        reply_to: String(row.reply_to || ""),
        subject: String(row.subject || ""),
        sent_at: String(row.sent_at),
        size: Number(row.size || 0),
        raw_path: String(row.raw_path),
        snippet: String(row.snippet || ""),
        has_attachments: !!row.has_attachments,
        seen: !!row.seen,
        flagged: !!row.flagged,
        answered: !!row.answered,
        draft: !!row.draft,
        deleted: !!row.deleted,
        recent: !!row.recent,
        spam_score: Number(row.spam_score || 0),
        auth_results: String(row.auth_results || ""),
        created_at: String(row.created_at),
    };
}

// ── Folders ──────────────────────────────────────────────────────────────────
export async function ensureDefaultFolders(accountId: number): Promise<void> {
    const db = getDb();
    const existing = await db.many("SELECT name FROM mail_folders WHERE account_id=$1", accountId);
    const have = new Set(existing.map((r) => String(r.name).toUpperCase()));
    for (const f of DEFAULT_FOLDERS) {
        if (have.has(f.name.toUpperCase()))
            continue;
        await db.execute(
            "INSERT INTO mail_folders (account_id,name,special_use,uidvalidity,uidnext,subscribed,created_at) VALUES ($1,$2,$3,$4,1,1,$5) ON CONFLICT (account_id,name) DO NOTHING",
            accountId, f.name, f.special, Date.now(), now(),
        );
    }
}

export async function listFolders(accountId: number): Promise<MailFolder[]> {
    const rows = await getDb().many("SELECT * FROM mail_folders WHERE account_id=$1 ORDER BY id", accountId);
    return rows.map(normalizeFolder);
}

export async function folderByName(accountId: number, name: string): Promise<MailFolder | null> {
    const row = await getDb().one("SELECT * FROM mail_folders WHERE account_id=$1 AND lower(name)=lower($2)", accountId, name);
    return row ? normalizeFolder(row) : null;
}

export async function folderById(accountId: number, id: number): Promise<MailFolder | null> {
    const row = await getDb().one("SELECT * FROM mail_folders WHERE account_id=$1 AND id=$2", accountId, id);
    return row ? normalizeFolder(row) : null;
}

export async function createFolder(accountId: number, name: string, special = ""): Promise<MailFolder> {
    const clean = sanitizeFolderName(name);
    if (!clean)
        throw new Error("A folder name is required.");
    const existing = await folderByName(accountId, clean);
    if (existing)
        throw new Error("A folder with this name already exists.");
    const id = (await getDb().execute(
        "INSERT INTO mail_folders (account_id,name,special_use,uidvalidity,uidnext,subscribed,created_at) VALUES ($1,$2,$3,$4,1,1,$5) RETURNING id",
        accountId, clean, special, Date.now(), now(),
    )).id;
    return normalizeFolder(await getDb().one("SELECT * FROM mail_folders WHERE id=$1", id));
}

export async function renameFolder(accountId: number, id: number, name: string): Promise<void> {
    const clean = sanitizeFolderName(name);
    if (!clean)
        throw new Error("A folder name is required.");
    const folder = await folderById(accountId, id);
    if (!folder)
        throw new Error("Folder not found.");
    if (folder.special_use === SPECIAL_USE.inbox)
        throw new Error("The inbox cannot be renamed.");
    const clash = await folderByName(accountId, clean);
    if (clash && clash.id !== id)
        throw new Error("A folder with this name already exists.");
    await getDb().execute("UPDATE mail_folders SET name=$1 WHERE id=$2 AND account_id=$3", clean, id, accountId);
}

export async function deleteFolder(accountId: number, id: number): Promise<void> {
    const folder = await folderById(accountId, id);
    if (!folder)
        throw new Error("Folder not found.");
    if (folder.special_use)
        throw new Error("System folders cannot be deleted.");
    const rows = await getDb().many("SELECT raw_path FROM mail_messages WHERE folder_id=$1", id);
    for (const r of rows) {
        try { await unlink(resolveStored(String(r.raw_path))); } catch { /* already gone */ }
    }
    await getDb().execute("DELETE FROM mail_messages WHERE folder_id=$1", id);
    await getDb().execute("DELETE FROM mail_folders WHERE id=$1 AND account_id=$2", id, accountId);
}

export function sanitizeFolderName(name: string): string {
    const clean = name.replace(/[\r\n\0]/g, "").replace(/^\/+|\/+$/g, "").trim();
    if (clean.length > 120)
        throw new Error("Folder name is too long.");
    return clean;
}

// ── Messages ─────────────────────────────────────────────────────────────────
export interface AppendInput {
    accountId: number;
    folderId: number;
    raw: Buffer;
    flags?: Partial<Pick<StoredMessage, "seen" | "flagged" | "answered" | "draft" | "deleted">>;
    meta: {
        messageId?: string;
        inReplyTo?: string;
        refs?: string;
        from?: MailAddress | null;
        to?: MailAddress[];
        cc?: MailAddress[];
        bcc?: MailAddress[];
        replyTo?: MailAddress[];
        subject?: string;
        sentAt?: string;
        snippet?: string;
        hasAttachments?: boolean;
        spamScore?: number;
        authResults?: string;
    };
}

// Write a message body to disk and add its row with a freshly allocated UID.
export async function appendMessage(input: AppendInput): Promise<StoredMessage> {
    const db = getDb();
    const id = randomUUID();
    const { absolute, relative } = messagePath(input.accountId, id);
    await writeFile(absolute, input.raw, { mode: 0o600 });

    try {
        return await withTransaction(async () => {
            // Lock the folder so UID allocation is serialised.
            const folderRow = await db.one("SELECT * FROM mail_folders WHERE id=$1 AND account_id=$2 FOR UPDATE", input.folderId, input.accountId);
            if (!folderRow)
                throw new Error("Folder not found.");
            const uid = Number(folderRow.uidnext);
            await db.execute("UPDATE mail_folders SET uidnext=$1 WHERE id=$2", uid + 1, input.folderId);

            const meta = input.meta;
            const from = meta.from || null;
            const flags = input.flags || {};
            const result = await db.execute(
                `INSERT INTO mail_messages (
                    account_id,folder_id,uid,message_id,in_reply_to,thread_refs,
                    sender_name,sender_addr,to_addrs,cc_addrs,bcc_addrs,reply_to,
                    subject,sent_at,size,raw_path,snippet,has_attachments,
                    seen,flagged,answered,draft,deleted,recent,spam_score,auth_results,created_at
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING id`,
                input.accountId, input.folderId, uid,
                meta.messageId || "", meta.inReplyTo || "", meta.refs || "",
                from?.name || "", from?.address || "",
                formatAddressList(meta.to || []), formatAddressList(meta.cc || []), formatAddressList(meta.bcc || []), formatAddressList(meta.replyTo || []),
                meta.subject || "", meta.sentAt || now(), input.raw.length, relative, meta.snippet || "", meta.hasAttachments ? 1 : 0,
                flags.seen ? 1 : 0, flags.flagged ? 1 : 0, flags.answered ? 1 : 0, flags.draft ? 1 : 0, flags.deleted ? 1 : 0, 1,
                meta.spamScore || 0, meta.authResults || "", now(),
            );
            return normalizeMessage(await db.one("SELECT * FROM mail_messages WHERE id=$1", result.id));
        });
    }
    catch (error) {
        try { await unlink(absolute); } catch { /* ignore */ }
        throw error;
    }
}

export async function readRaw(message: StoredMessage): Promise<Buffer> {
    return readFile(resolveStored(message.raw_path));
}

export async function messageById(accountId: number, id: number): Promise<StoredMessage | null> {
    const row = await getDb().one("SELECT * FROM mail_messages WHERE account_id=$1 AND id=$2", accountId, id);
    return row ? normalizeMessage(row) : null;
}

export async function messagesInFolder(accountId: number, folderId: number, limit = 500): Promise<StoredMessage[]> {
    const rows = await getDb().many(
        "SELECT * FROM mail_messages WHERE account_id=$1 AND folder_id=$2 ORDER BY uid ASC LIMIT $3",
        accountId, folderId, limit,
    );
    return rows.map(normalizeMessage);
}

export interface MessageQuery {
    folderId: number;
    limit?: number;
    offset?: number;
    unseenOnly?: boolean;
    flaggedOnly?: boolean;
    since?: string;
    before?: string;
    search?: string;
}

export async function queryMessages(accountId: number, q: MessageQuery): Promise<{ total: number; messages: StoredMessage[] }> {
    const where: string[] = ["account_id=$1", "folder_id=$2", "deleted=0"];
    const args: unknown[] = [accountId, q.folderId];
    if (q.unseenOnly)
        where.push("seen=0");
    if (q.flaggedOnly)
        where.push("flagged=1");
    if (q.since) {
        args.push(q.since);
        where.push(`sent_at >= $${args.length}`);
    }
    if (q.before) {
        args.push(q.before);
        where.push(`sent_at < $${args.length}`);
    }
    if (q.search) {
        args.push(`%${q.search.toLowerCase()}%`);
        const i = args.length;
        where.push(`(lower(subject) LIKE $${i} OR lower(sender_addr) LIKE $${i} OR lower(sender_name) LIKE $${i} OR lower(to_addrs) LIKE $${i} OR lower(snippet) LIKE $${i})`);
    }
    const clause = where.join(" AND ");
    const totalRow = await getDb().one(`SELECT count(*) AS c FROM mail_messages WHERE ${clause}`, ...args);
    const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
    const offset = Math.max(q.offset ?? 0, 0);
    const rows = await getDb().many(
        `SELECT * FROM mail_messages WHERE ${clause} ORDER BY uid DESC LIMIT ${limit} OFFSET ${offset}`,
        ...args,
    );
    return { total: Number(totalRow?.c || 0), messages: rows.map(normalizeMessage) };
}

export async function setFlags(accountId: number, ids: number[], flags: Partial<Record<"seen" | "flagged" | "answered" | "draft" | "deleted", boolean>>): Promise<void> {
    if (!ids.length)
        return;
    const sets: string[] = [];
    const args: unknown[] = [accountId];
    for (const [key, value] of Object.entries(flags)) {
        if (value === undefined)
            continue;
        args.push(value ? 1 : 0);
        sets.push(`${key}=$${args.length}`);
    }
    if (!sets.length)
        return;
    args.push(ids);
    await getDb().execute(
        `UPDATE mail_messages SET ${sets.join(", ")} WHERE account_id=$1 AND id = ANY($${args.length}::int[])`,
        ...args,
    );
}

export async function moveMessages(accountId: number, ids: number[], targetFolderId: number): Promise<number[]> {
    const moved: number[] = [];
    for (const id of ids) {
        const msg = await messageById(accountId, id);
        if (!msg)
            continue;
        const folderRow = await getDb().one("SELECT * FROM mail_folders WHERE id=$1 AND account_id=$2 FOR UPDATE", targetFolderId, accountId);
        if (!folderRow)
            throw new Error("Target folder not found.");
        const uid = Number(folderRow.uidnext);
        await getDb().execute("UPDATE mail_folders SET uidnext=$1 WHERE id=$2", uid + 1, targetFolderId);
        await getDb().execute("UPDATE mail_messages SET folder_id=$1, uid=$2, recent=1 WHERE id=$3", targetFolderId, uid, id);
        moved.push(id);
    }
    return moved;
}

export async function copyMessages(accountId: number, ids: number[], targetFolderId: number): Promise<number[]> {
    const created: number[] = [];
    for (const id of ids) {
        const msg = await messageById(accountId, id);
        if (!msg)
            continue;
        const raw = await readRaw(msg);
        const copy = await appendMessage({
            accountId,
            folderId: targetFolderId,
            raw,
            flags: { seen: msg.seen, flagged: msg.flagged, answered: msg.answered, draft: msg.draft, deleted: msg.deleted },
            meta: {
                messageId: msg.message_id, inReplyTo: msg.in_reply_to, refs: msg.thread_refs,
                from: { name: msg.sender_name, address: msg.sender_addr },
                subject: msg.subject, sentAt: msg.sent_at, snippet: msg.snippet,
                hasAttachments: msg.has_attachments, spamScore: msg.spam_score, authResults: msg.auth_results,
            },
        });
        created.push(copy.id);
    }
    return created;
}

// Permanently remove rows already marked \Deleted and delete their files.
export async function expungeFolder(accountId: number, folderId: number): Promise<number> {
    const rows = await getDb().many("SELECT id,raw_path FROM mail_messages WHERE account_id=$1 AND folder_id=$2 AND deleted=1", accountId, folderId);
    for (const r of rows) {
        try { await unlink(resolveStored(String(r.raw_path))); } catch { /* ignore */ }
    }
    if (rows.length)
        await getDb().execute("DELETE FROM mail_messages WHERE account_id=$1 AND folder_id=$2 AND deleted=1", accountId, folderId);
    return rows.length;
}

export async function purgeMessages(accountId: number, ids: number[]): Promise<void> {
    for (const id of ids) {
        const msg = await messageById(accountId, id);
        if (!msg)
            continue;
        try { await unlink(resolveStored(msg.raw_path)); } catch { /* ignore */ }
        await getDb().execute("DELETE FROM mail_messages WHERE id=$1 AND account_id=$2", id, accountId);
    }
}

export async function folderStats(accountId: number, folderId: number): Promise<{ messages: number; unseen: number; recent: number; size: number; firstUid: number; lastUid: number }> {
    const row = await getDb().one(
        `SELECT count(*) AS messages,
                coalesce(sum(CASE WHEN seen=0 THEN 1 ELSE 0 END),0) AS unseen,
                coalesce(sum(CASE WHEN recent=1 THEN 1 ELSE 0 END),0) AS recent,
                coalesce(sum(size),0) AS size,
                coalesce(min(uid),0) AS first_uid,
                coalesce(max(uid),0) AS last_uid
         FROM mail_messages WHERE account_id=$1 AND folder_id=$2 AND deleted=0`,
        accountId, folderId,
    );
    return {
        messages: Number(row?.messages || 0),
        unseen: Number(row?.unseen || 0),
        recent: Number(row?.recent || 0),
        size: Number(row?.size || 0),
        firstUid: Number(row?.first_uid || 0),
        lastUid: Number(row?.last_uid || 0),
    };
}

export async function clearRecent(accountId: number, folderId: number): Promise<void> {
    await getDb().execute("UPDATE mail_messages SET recent=0 WHERE account_id=$1 AND folder_id=$2 AND recent=1", accountId, folderId);
}

export async function fileSize(relative: string): Promise<number> {
    try {
        const s = await stat(resolveStored(relative));
        return s.size;
    }
    catch {
        return 0;
    }
}
