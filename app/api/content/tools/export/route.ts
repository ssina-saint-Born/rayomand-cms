import { getDb } from "@/lib/db";
import { getAllOptions } from "@/lib/options";
import { auth } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const db = getDb();
    const data = {
        generator: "rayomand-cms/1.0",
        exported_at: new Date().toISOString(),
        posts: (await db.many("SELECT * FROM posts")),
        terms: (await db.many("SELECT * FROM terms")),
        relationships: (await db.many("SELECT * FROM term_relationships")),
        comments: (await db.many("SELECT * FROM comments")),
        menus: (await db.many("SELECT * FROM menus")),
        menu_items: (await db.many("SELECT * FROM menu_items")),
        options: (await getAllOptions()),
    };
    return new Response(JSON.stringify(data, null, 2), {
        headers: {
            "Content-Type": "application/json",
            "Content-Disposition": 'attachment; filename="rayomand-export.json"',
        },
    });
}
