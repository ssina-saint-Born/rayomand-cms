import { getDb, withTransaction } from "./db";
import type { User } from "./types";
export async function listUsers(): Promise<User[]> {
    return (await getDb().many("SELECT id,username,email,display_name,role,bio,created_at FROM users ORDER BY id ASC")) as User[];
}
export async function getUser(id: number): Promise<User | null> {
    const r = (await getDb().one("SELECT id,username,email,display_name,role,bio,created_at FROM users WHERE id=$1", id)) as User | undefined;
    return r ?? null;
}
export async function getUserByUsername(username: string): Promise<User | null> {
    const r = (await getDb().one("SELECT id,username,email,display_name,role,bio,created_at FROM users WHERE username=$1", username)) as User | undefined;
    return r ?? null;
}
export async function getUserWithHash(username: string) {
    return (await getDb().one("SELECT * FROM users WHERE lower(username)=lower($1) OR lower(email)=lower($1)", username)) as (User & {
        password_hash: string;
    }) | undefined;
}
export async function createUser(data: {
    username: string;
    email: string;
    password_hash: string;
    display_name: string;
    role: string;
    bio?: string;
}): Promise<number> {
    const r = (await getDb().execute("INSERT INTO users (username,email,password_hash,display_name,role,bio,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id", data.username, data.email, data.password_hash, data.display_name || data.username, data.role, data.bio || "", new Date().toISOString()));
    return Number(r.id);
}
export async function updateUser(id: number, data: Partial<{
    email: string;
    display_name: string;
    role: string;
    bio: string;
    password_hash: string;
}>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    for (const [k, v] of Object.entries(data)) {
        if (v === undefined)
            continue;
        fields.push(`${k}=$${values.length + 1}`);
        values.push(v);
    }
    if (!fields.length)
        return;
    values.push(id);
    (await getDb().execute(`UPDATE users SET ${fields.join(",")} WHERE id=$${values.length}`, ...values));
}
export async function deleteUser(id: number): Promise<void> {
    return withTransaction(async () => {
        (await getDb().execute("DELETE FROM users WHERE id=$1", id));
        (await getDb().execute("DELETE FROM sessions WHERE user_id=$1", id));
    });
}
export async function countUsers(): Promise<number> {
    const r = (await getDb().one("SELECT COUNT(*) AS c FROM users")) as {
        c: number;
    };
    return r.c;
}
