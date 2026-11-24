import { getDb, now } from "./db";
import type { Media } from "./types";
function withUrl(m: Media): Media {
    return { ...m, url: `/uploads/${m.stored_name}` };
}
export async function listMedia(): Promise<Media[]> {
    const rows = (await getDb().many("SELECT * FROM media ORDER BY id DESC")) as Media[];
    return rows.map(withUrl);
}
export async function getMedia(id: number): Promise<Media | null> {
    const r = (await getDb().one("SELECT * FROM media WHERE id=$1", id)) as Media | undefined;
    return r ? withUrl(r) : null;
}
export async function createMedia(data: {
    filename: string;
    stored_name: string;
    mime: string;
    size: number;
    width?: number | null;
    height?: number | null;
    alt?: string;
    caption?: string;
    title?: string;
    uploaded_by?: number | null;
}): Promise<number> {
    const r = (await getDb().execute("INSERT INTO media (filename,stored_name,mime,size,width,height,alt,caption,title,uploaded_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id", data.filename, data.stored_name, data.mime, data.size, data.width ?? null, data.height ?? null, data.alt || "", data.caption || "", data.title || data.filename, data.uploaded_by ?? null, now()));
    return Number(r.id);
}
export async function updateMedia(id: number, data: Partial<{
    alt: string;
    caption: string;
    title: string;
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
    (await getDb().execute(`UPDATE media SET ${fields.join(",")} WHERE id=$${values.length}`, ...values));
}
export async function deleteMedia(id: number): Promise<void> {
    (await getDb().execute("DELETE FROM media WHERE id=$1", id));
}
export async function countMedia(): Promise<number> {
    return ((await getDb().one("SELECT COUNT(*) AS c FROM media")) as {
        c: number;
    }).c;
}
