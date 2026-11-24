import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import { getDb, now } from "./db";
import { verifyPassword } from "./password";
import { getUserWithHash } from "./users";
import { resolveApiToken } from "./api-tokens";
import type { Role, User } from "./types";
import { ROLE_RANK } from "./types";
const COOKIE = "rm_session";
const SESSION_DAYS = 14;
export async function authenticate(username: string, password: string): Promise<User | null> {
    const u = (await getUserWithHash(username));
    if (!u)
        return null;
    if (!verifyPassword(password, u.password_hash))
        return null;
    const { password_hash, ...rest } = u;
    return rest as User;
}
export async function createSession(userId: number): Promise<string> {
    const token = randomBytes(32).toString("hex");
    const exp = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    (await getDb().execute("INSERT INTO sessions (token,user_id,created_at,expires_at) VALUES ($1,$2,$3,$4)", token, userId, now(), exp));
    return token;
}
export function setSessionCookie(token: string): void {
    cookies().set(COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_DAYS * 86400,
    });
}
export async function clearSessionCookie(): Promise<void> {
    const token = cookies().get(COOKIE)?.value;
    if (token)
        (await getDb().execute("DELETE FROM sessions WHERE token=$1", token));
    cookies().set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}
export async function currentUser(): Promise<User | null> {
    // API clients (the mobile app) authenticate with a bearer token; browsers
    // use the session cookie. Either path resolves to the same user.
    const bearer = headers().get("authorization") || "";
    const match = /^Bearer\s+(.+)$/i.exec(bearer);
    if (match) {
        const userId = await resolveApiToken(match[1]);
        if (userId)
            return (await getDb().one("SELECT id,username,email,display_name,role,bio,created_at FROM users WHERE id=$1", userId)) as User ?? null;
        return null;
    }

    const token = cookies().get(COOKIE)?.value;
    if (!token)
        return null;
    const db = getDb();
    const sess = (await db.one("SELECT user_id, expires_at FROM sessions WHERE token=$1", token)) as {
        user_id: number;
        expires_at: string;
    } | undefined;
    if (!sess)
        return null;
    if (new Date(sess.expires_at).getTime() < Date.now()) {
        (await db.execute("DELETE FROM sessions WHERE token=$1", token));
        return null;
    }
    const u = (await db.one("SELECT id,username,email,display_name,role,bio,created_at FROM users WHERE id=$1", sess.user_id)) as User | undefined;
    return u ?? null;
}
export function hasRole(user: User | null, min: Role): boolean {
    return !!user && ROLE_RANK[user.role] >= ROLE_RANK[min];
}
export function canEdit(user: User | null): boolean {
    return hasRole(user, "contributor");
}
export function canPublish(user: User | null): boolean {
    return hasRole(user, "author");
}
export function canManage(user: User | null): boolean {
    return hasRole(user, "editor");
}
export function isAdmin(user: User | null): boolean {
    return hasRole(user, "administrator");
}
