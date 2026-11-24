import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { listMedia, createMedia, getMedia } from "@/lib/media";
import { ok, fail, auth } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const ALLOWED: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "audio/mpeg": "mp3",
    "video/mp4": "mp4",
    "application/zip": "zip",
};
const MAX_BYTES = 20 * 1024 * 1024;
export async function GET() {
    return ok((await listMedia()));
}
export async function POST(req: Request) {
    const { user, res } = (await auth("author"));
    if (res)
        return res;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
        return fail("No file uploaded");
    const ext = ALLOWED[file.type];
    if (!ext)
        return fail(`Unsupported file type: ${file.type || "unknown"}`);
    if (file.size > MAX_BYTES)
        return fail("File exceeds 20 MB limit");
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const stored_name = `${randomBytes(16).toString("hex")}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, stored_name), buffer);
    const id = (await createMedia({
        filename: file.name,
        stored_name,
        mime: file.type,
        size: file.size,
        title: file.name.replace(/\.[^.]+$/, ""),
        uploaded_by: user!.id,
    }));
    return ok((await getMedia(id)), 201);
}
