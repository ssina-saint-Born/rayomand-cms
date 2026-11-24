import { randomInt } from "node:crypto";
import { getDb } from "../db";
import { createUser as coreCreateUser } from "../users";
import { createSession } from "../auth";
import { hashPassword, verifyPassword } from "../password";
import { Mobile } from "./mobile";
import { Identifier } from "./identifier";
import { defaultNewRole, getAccessOption } from "./settings";

export interface AccessUser {
    id: number;
    username: string;
    email: string;
    mobile: string | null;
    display_name: string;
    role: string;
    created_at: string;
}

const COLS = "id,username,email,mobile,display_name,role,created_at";

export async function getUser(id: number): Promise<AccessUser | null> {
    const r = await getDb().one(`SELECT ${COLS} FROM users WHERE id=$1`, id);
    return (r as AccessUser) || null;
}

export async function getByEmail(email: string): Promise<AccessUser | null> {
    const r = await getDb().one(`SELECT ${COLS} FROM users WHERE lower(email)=lower($1)`, email);
    return (r as AccessUser) || null;
}

export async function getByUsername(username: string): Promise<AccessUser | null> {
    const r = await getDb().one(`SELECT ${COLS} FROM users WHERE username=$1`, username);
    return (r as AccessUser) || null;
}

export function isEmailAddress(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// Configured meta keys that may hold a mobile (advanced.mobile_possible_meta_keys).
async function mobileMetaKeys(): Promise<string[]> {
    const raw = String(await getAccessOption("advanced.mobile_possible_meta_keys", ""));
    return raw.split(/\r?\n/).map((k) => k.trim()).filter(Boolean);
}

// Mirrors UserService::get_by_mobile(): match the canonical mobile column, a
// phone stored in the per-user meta keys, or the customer billing profile.
export async function getByMobile(mobile: string): Promise<AccessUser | null> {
    const m = new Mobile(mobile);
    if (!m.isValid())
        return null;
    const formats = m.possibleFormats();
    const placeholders = formats.map((_, i) => `$${i + 1}`).join(",");
    const row = await getDb().one(`SELECT ${COLS} FROM users WHERE mobile IN (${placeholders}) ORDER BY id LIMIT 1`, ...formats);
    if (row)
        return row as AccessUser;

    const keys = await mobileMetaKeys();
    if (keys.length) {
        for (const f of formats) {
            const meta = await getDb().one(
                `SELECT u.id,u.username,u.email,u.mobile,u.display_name,u.role,u.created_at
                   FROM user_meta um JOIN users u ON u.id=um.user_id
                  WHERE um.key = ANY($1) AND replace(replace(um.value,' ',''),'-','') = $2
                  ORDER BY u.id LIMIT 1`,
                keys, f.replace(/[ -]/g, ""),
            );
            if (meta)
                return meta as AccessUser;
        }
    }

    for (const f of formats) {
        const r = await getDb().one(
            "SELECT u.id,u.username,u.email,u.mobile,u.display_name,u.role,u.created_at FROM customer_profiles cp JOIN users u ON u.id=cp.user_id WHERE cp.billing LIKE $1 ORDER BY u.id LIMIT 1",
            `%"${f}"%`,
        );
        if (r)
            return r as AccessUser;
    }
    return null;
}

export async function getUserMeta(userId: number, key: string): Promise<string | null> {
    const row = await getDb().one("SELECT value FROM user_meta WHERE user_id=$1 AND key=$2", userId, key);
    return row ? String(row.value) : null;
}

export async function setUserMeta(userId: number, key: string, value: string): Promise<void> {
    await getDb().execute(
        "INSERT INTO user_meta (user_id,key,value) VALUES ($1,$2,$3) ON CONFLICT (user_id,key) DO UPDATE SET value=EXCLUDED.value",
        userId, key, value,
    );
}

export async function matchIdentifier(identifier: Identifier): Promise<AccessUser | null> {
    if (identifier.isEmail())
        return getByEmail(identifier.getValue());
    if (identifier.isMobile())
        return getByMobile(identifier.getValue());
    if (identifier.isUsername())
        return getByUsername(identifier.getValue());
    return null;
}

// Mirrors UserService::create(): create a user keyed by the mobile username,
// with the NO_PASSWORD_ marker and the configured default role. Email uses a
// unique derived address when none is provided so the unique constraint holds.
export async function createByMobile(mobile: string, email = ""): Promise<number> {
    const m = new Mobile(mobile);
    if (!m.isValid())
        throw new Error("تلفن همراه برای ثبت نام معتبر نمی‌باشد.");
    const username = m.getSanitizedUsername();
    const role = await defaultNewRole();
    const safeEmail = email && isEmailAddress(email) ? email : `${username}@access.local`;
    const id = await coreCreateUser({
        username,
        email: safeEmail,
        password_hash: "NO_PASSWORD_" + randomToken(20),
        display_name: "کاربر",
        role,
    });
    await getDb().execute("UPDATE users SET mobile=$1 WHERE id=$2", m.getFormatted(), id);
    // Keep the canonical mobile mirrored into user meta so exports and the
    // configurable meta-key lookup both find it.
    await setUserMeta(id, "billing_phone", m.getFormatted());
    // Seed a billing profile so account/order pages show the phone before the
    // first checkout, matching the plugin's billing_phone usermeta behaviour.
    try {
        const { saveCustomerProfile } = await import("../shop/people");
        await saveCustomerProfile(id, { phone: m.getFormatted(), email: safeEmail, country: "IR" }, {});
    }
    catch { /* non-fatal: profile is created on first checkout */ }
    return id;
}

export async function getOrCreateByMobile(identifier: string, userId: number | null): Promise<number> {
    if (userId)
        return userId;
    return createByMobile(identifier);
}

export async function updateUserMobileUsername(userId: number, username: string): Promise<boolean> {
    try {
        await getDb().execute("UPDATE users SET username=$1 WHERE id=$2", username, userId);
        return true;
    }
    catch {
        return false;
    }
}

export async function setUserMobile(userId: number, mobile: string): Promise<void> {
    await getDb().execute("UPDATE users SET mobile=$1 WHERE id=$2", new Mobile(mobile).getFormatted(), userId);
}

// Mirrors UserService::get_mobile(): canonical column, then configured meta
// keys, then the billing profile phone.
export async function getMobile(userId: number): Promise<string | null> {
    const u = await getUser(userId);
    if (!u)
        return null;
    if (u.mobile)
        return u.mobile;
    for (const key of await mobileMetaKeys()) {
        const raw = await getUserMeta(userId, key);
        if (!raw)
            continue;
        const m = new Mobile(raw);
        if (m.isValid())
            return m.getFormatted();
    }
    const prof = await getDb().one("SELECT billing FROM customer_profiles WHERE user_id=$1", userId);
    if (prof) {
        try {
            const billing = JSON.parse(prof.billing || "{}");
            const m = new Mobile(String(billing.phone || ""));
            if (m.isValid())
                return m.getFormatted();
        }
        catch { /* ignore */ }
    }
    return null;
}

// Mirrors UserService::login(): create a session and remember the method.
export async function loginUser(userId: number, loginMethod?: string): Promise<string> {
    const token = await createSession(userId);
    if (loginMethod)
        await setLoginMethod(userId, loginMethod);
    return token;
}

export async function setLoginMethod(userId: number, method: string): Promise<void> {
    await getDb().execute(
        "INSERT INTO options (name,value) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value",
        `access_login_method_${userId}`, method,
    );
}

export async function getLoginMethod(userId: number): Promise<string> {
    const r = await getDb().one("SELECT value FROM options WHERE name=$1", `access_login_method_${userId}`);
    return r ? String(r.value) : "";
}

export async function getByUsernameOrEmailWithHash(identifier: string) {
    return getDb().one(
        "SELECT * FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($1)",
        identifier,
    );
}

export async function getWithHashById(userId: number) {
    return getDb().one("SELECT * FROM users WHERE id=$1", userId);
}

// Mirrors WP get_password_reset_key(): issue a single-use key with an expiry.
// We store only a scrypt hash of the key, never the key itself.
export async function issuePasswordResetKey(userId: number): Promise<string> {
    const key = randomToken(48);
    await getDb().execute(
        `INSERT INTO access_password_resets (user_id,key_hash,expires_at,created_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id) DO UPDATE SET key_hash=$2, expires_at=$3, created_at=$4`,
        userId, hashPassword(key), new Date(Date.now() + 30 * 60000).toISOString(), new Date().toISOString(),
    );
    return key;
}

// Mirrors check_password_reset_key(): valid only when unexpired and matching.
export async function checkPasswordResetKey(userId: number, key: string): Promise<boolean> {
    const row = await getDb().one("SELECT key_hash,expires_at FROM access_password_resets WHERE user_id=$1", userId);
    if (!row)
        return false;
    if (new Date(row.expires_at).getTime() < Date.now())
        return false;
    return verifyPassword(key, row.key_hash);
}

export async function consumePasswordResetKey(userId: number): Promise<void> {
    await getDb().execute("DELETE FROM access_password_resets WHERE user_id=$1", userId);
}

function randomToken(len: number): string {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let out = "";
    for (let i = 0; i < len; i++)
        out += chars[randomInt(chars.length)];
    return out;
}