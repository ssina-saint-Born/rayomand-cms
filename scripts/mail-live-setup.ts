import { loadEnv } from "../lib/env";
import { getDb, now } from "../lib/db";
import { hashPassword } from "../lib/mail/engine/password";

loadEnv();

// Live protocol test bootstrap: ensures mail settings exist and a mailbox with
// a known password is available so SMTP/IMAP/POP3 can be exercised by a real
// client. Safe to re-run; idempotent on the account.

async function main() {
    const db = getDb();
    await db.execute("SELECT 1");

    const existing = await db.one("SELECT id FROM mail_settings WHERE id=1");
    if (!existing) {
        await db.execute(
            "INSERT INTO mail_settings (id, public_hostname, mail_hostname, updated_at) VALUES (1, $1, $2, $3)",
            "localhost", "mail.localhost", now(),
        );
        console.log("mail_settings: created (mail_hostname=mail.localhost)");
    } else {
        await db.execute("UPDATE mail_settings SET mail_hostname=$1, updated_at=$2 WHERE id=1", "mail.localhost", now());
        console.log("mail_settings: updated mail_hostname=mail.localhost");
    }

    const domain = await db.one("SELECT id, name FROM mail_domains WHERE lower(name)='example.com'");
    if (!domain)
        throw new Error("example.com domain missing");

    const address = "probe@example.com";
    const secret = "Probe-Pass-2026";
    const hash = await hashPassword(secret);
    const found = await db.one("SELECT id FROM mail_accounts WHERE lower(address)=lower($1)", address);
    if (found) {
        await db.execute("UPDATE mail_accounts SET password_hash=$1, enabled=1 WHERE id=$2", hash, found.id);
        console.log(`account: reset password for ${address}`);
    } else {
        await db.execute(
            "INSERT INTO mail_accounts (domain_id, quota_mb, linked_user_id, enabled, password_hash, address, local_part, display_name, created_at) VALUES ($1,$2,NULL,1,$3,$4,$5,$6,$7)",
            domain.id, 1024, hash, address, "probe", "Probe Mailbox", now(),
        );
        console.log(`account: created ${address}`);
    }

    // Give the mailbox the standard folders so a client can SELECT them.
    const acc = await db.one("SELECT id FROM mail_accounts WHERE lower(address)=lower($1)", address);
    const folders: Array<[string, string]> = [
        ["INBOX", ""], ["Sent", "\\Sent"], ["Drafts", "\\Drafts"], ["Trash", "\\Trash"], ["Junk", "\\Junk"], ["Archive", "\\Archive"],
    ];
    for (const [name, special] of folders) {
        const row = await db.one("SELECT id FROM mail_folders WHERE account_id=$1 AND lower(name)=lower($2)", acc.id, name);
        if (!row) {
            await db.execute(
                "INSERT INTO mail_folders (account_id, uidvalidity, uidnext, subscribed, name, special_use, created_at) VALUES ($1,$2,1,1,$3,$4,$5)",
                acc.id, Math.floor(Date.now() / 1000), name, special, now(),
            );
        }
    }
    console.log(`account: folders ensured for ${address}`);
    console.log(`credentials: ${address} / ${secret}`);
    process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
