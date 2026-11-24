import { getDb, withTransaction } from "./db";
import type { Menu, MenuItem } from "./types";
export async function listMenus(): Promise<Menu[]> {
    const menus = (await getDb().many("SELECT * FROM menus ORDER BY id ASC")) as Menu[];
    return (await Promise.all(menus.map(async (m) => ({ ...m, items: (await getMenuItems(m.id)) }))));
}
export async function getMenuItems(menuId: number): Promise<MenuItem[]> {
    return (await getDb().many("SELECT * FROM menu_items WHERE menu_id=$1 ORDER BY position ASC, id ASC", menuId)) as MenuItem[];
}
export async function getMenu(id: number): Promise<Menu | null> {
    const m = (await getDb().one("SELECT * FROM menus WHERE id=$1", id)) as Menu | undefined;
    return m ? { ...m, items: (await getMenuItems(m.id)) } : null;
}
export async function getMenuByLocation(location: string): Promise<Menu | null> {
    const m = (await getDb().one("SELECT * FROM menus WHERE location=$1", location)) as Menu | undefined;
    return m ? { ...m, items: (await getMenuItems(m.id)) } : null;
}
export async function createMenu(name: string, location = ""): Promise<number> {
    const r = (await getDb().execute("INSERT INTO menus (name,location) VALUES ($1,$2) RETURNING id", name, location));
    return Number(r.id);
}
export async function updateMenu(id: number, data: {
    name?: string;
    location?: string;
}): Promise<void> {
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
    (await getDb().execute(`UPDATE menus SET ${fields.join(",")} WHERE id=$${values.length}`, ...values));
}
export async function deleteMenu(id: number): Promise<void> {
    return withTransaction(async () => {
        const db = getDb();
        (await db.execute("DELETE FROM menus WHERE id=$1", id));
        (await db.execute("DELETE FROM menu_items WHERE menu_id=$1", id));
    });
}
export async function saveMenuItems(menuId: number, items: {
    label: string;
    url: string;
    type?: string;
    object_id?: number | null;
    parent_id?: number;
}[]): Promise<void> {
    return withTransaction(async () => {
        const db = getDb();
        (await db.execute("DELETE FROM menu_items WHERE menu_id=$1", menuId));
        const ins = "INSERT INTO menu_items (menu_id,label,url,type,object_id,parent_id,position) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id";
        (await Promise.all(items.map(async (it, i) => (await db.execute("INSERT INTO menu_items (menu_id,label,url,type,object_id,parent_id,position) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id", menuId, it.label, it.url, it.type || "custom", it.object_id ?? null, it.parent_id || 0, i)))));
    });
}
