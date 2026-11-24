import { getDb } from "@/lib/db";
import { getMobile } from "@/lib/access/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface ExportUser {
    id: number;
    username: string;
    email: string;
    display_name: string;
    role: string;
    created_at: string;
    mobile: string | null;
}

// Mirrors ExportUsers::get_users(): all users, optionally filtered by a
// search term (`s`) and a role, honoring orderby/order.
export async function collectUsers(params: {
    s?: string;
    role?: string;
    orderby?: string;
    order?: string;
}): Promise<ExportUser[]> {
    const where: string[] = [];
    const values: unknown[] = [];

    if (params.s) {
        const like = `%${params.s}%`;
        where.push(`(username ILIKE $${values.push(like)} OR email ILIKE $${values.push(like)} OR display_name ILIKE $${values.push(like)} OR COALESCE(mobile,'') ILIKE $${values.push(like)})`);
    }
    if (params.role) {
        where.push(`role=$${values.push(params.role)}`);
    }

    const orderMap: Record<string, string> = {
        id: "id",
        login: "username",
        username: "username",
        email: "email",
        name: "display_name",
        display_name: "display_name",
        registered: "created_at",
    };
    const col = orderMap[(params.orderby || "").toLowerCase()] || "id";
    const dir = (params.order || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";

    const rows = await getDb().many(
        `SELECT id,username,email,display_name,role,created_at,mobile FROM users ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${col} ${dir}`,
        ...values,
    );

    return Promise.all(rows.map(async (u: any) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        display_name: u.display_name,
        role: u.role,
        created_at: u.created_at,
        mobile: await getMobile(u.id),
    })));
}
