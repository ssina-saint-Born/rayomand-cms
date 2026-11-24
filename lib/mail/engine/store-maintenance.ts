import { rm } from "node:fs/promises";
import path from "node:path";
import { getDb } from "../../db";
import { mailDataDir } from "./paths";

// Destructive housekeeping kept apart from the hot-path store module so the
// protocol daemons never import a filesystem-wide delete.

export async function deleteAccountData(accountId: number): Promise<void> {
    const db = getDb();
    await db.execute("DELETE FROM mail_outbox WHERE account_id=$1", accountId);
    await db.execute("DELETE FROM mail_messages WHERE account_id=$1", accountId);
    await db.execute("DELETE FROM mail_folders WHERE account_id=$1", accountId);
    const dir = path.join(mailDataDir(), "accounts", String(accountId));
    try {
        await rm(dir, { recursive: true, force: true });
    }
    catch { /* files may already be gone */ }
}

export async function accountUsage(accountId: number): Promise<number> {
    const row = await getDb().one("SELECT coalesce(sum(size),0) AS s FROM mail_messages WHERE account_id=$1", accountId);
    return Number(row?.s || 0);
}
