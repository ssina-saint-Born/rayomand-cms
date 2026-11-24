import fs from "node:fs";
import path from "node:path";
import { fail } from "@/lib/api";
import { getDownloadsSettings, getShopSettings } from "@/lib/shop/core";
import { getProduct } from "@/lib/shop/products";
import { consumeTokenFiles, peekToken } from "@/lib/shop/downloads";
import { buildZip } from "@/lib/shop/zip";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PUBLIC_DIR = path.join(process.cwd(), "public");
const MIME: Record<string, string> = {
    ".zip": "application/zip", ".pdf": "application/pdf", ".png": "image/png",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
    ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".txt": "text/plain",
};
function safeRead(rel: string): Buffer | null {
    try {
        const abs = fs.realpathSync(path.resolve(PUBLIC_DIR, rel.replace(/^\/+/, "")));
        if (!abs.startsWith(fs.realpathSync(PUBLIC_DIR) + path.sep))
            return null;
        return fs.readFileSync(abs);
    }
    catch {
        return null;
    }
}
export async function GET(req: Request) {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!(await getShopSettings()).enable_downloads)
        return fail("Downloads are disabled.", 403);
    if (!token)
        return fail("Start your download from the product page.", 403);
    const som = (await getDownloadsSettings());
    const check = (await peekToken(token));
    if (!check.ok) {
        const msg = check.reason === "used" ? som.email_used_message : check.reason === "expired" ? som.email_expire_message : "This download link is invalid.";
        return fail(String(msg), 410);
    }
    const product = (await getProduct(check.row.variation_id || check.row.product_id));
    if (!product || product.status !== "publish")
        return fail("File not found.", 404);
    const files = product.files || [];
    const wantZip = url.searchParams.get("zip") === "1";
    const inline = url.searchParams.get("view") === "1";
    const name = product.slug.replace(/["\r\n]/g, "");
    if (wantZip) {
        const selection = url.searchParams.get("files");
        const selected: number[] = selection ? Array.from(new Set(selection.split(",").map(Number))) : check.row.file_indices;
        if (!selected.length || selected.some((i) => !Number.isInteger(i) || !check.row.file_indices.includes(i)))
            return fail("Invalid file selection.", 403);
        const entries: {
            name: string;
            data: Buffer;
        }[] = [];
        for (const i of selected) {
            const f = files[i];
            if (!f)
                return fail("File not found.", 404);
            const data = safeRead(f.file);
            if (data)
                entries.push({ name: path.basename(f.name || f.file), data });
        }
        if (!entries.length)
            return fail("No files are attached to this product.", 404);
        const zip = buildZip(entries);
        if (!await consumeTokenFiles(token, selected)) return fail("File grant has expired or was already consumed.", 410);
        return new Response(new Uint8Array(zip), { headers: {
                "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}.zip"`,
                "Content-Length": String(zip.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
            } });
    }
    const idx = Number(url.searchParams.get("f") || 0);
    if (!Number.isInteger(idx) || !check.row.file_indices.includes(idx))
        return fail("File unavailable or already downloaded.", 410);
    const file = files[idx];
    if (!file)
        return fail("File not found.", 404);
    const data = safeRead(file.file);
    if (!data)
        return fail("File is missing from storage.", 404);
    if (!inline && !await consumeTokenFiles(token, [idx])) return fail("File grant has expired or was already consumed.", 410);
    const ext = path.extname(file.file).toLowerCase();
    const filename = (file.name || path.basename(file.file)).replace(/["\r\n]/g, "");
    return new Response(new Uint8Array(data), { headers: {
            "Content-Type": MIME[ext] || "application/octet-stream",
            "Content-Disposition": `${inline && ext === ".pdf" ? "inline" : "attachment"}; filename="${filename}"`,
            "Content-Length": String(data.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
        } });
}
