import { ok, fail } from "@/lib/api";
import { getDownloadsSettings, getShopSettings } from "@/lib/shop/core";
import { getProduct } from "@/lib/shop/products";
import { peekToken } from "@/lib/shop/downloads";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
    const token = new URL(req.url).searchParams.get("token") || "";
    const som = (await getDownloadsSettings());
    if (!(await getShopSettings()).enable_downloads)
        return fail("Downloads are disabled.", 403);
    const check = (await peekToken(token));
    if (!check.ok) {
        const message = check.reason === "used" ? som.email_used_message : check.reason === "expired" ? som.email_expire_message : "This download link is invalid.";
        return ok({ ok: false, reason: check.reason, message: String(message) });
    }
    const product = (await getProduct(check.row.variation_id || check.row.product_id));
    if (!product)
        return fail("Product not found.", 404);
    return ok({
        ok: true,
        product: { id: product.id, name: product.name, slug: product.slug, images: product.images, files: check.row.file_indices.map((i: number) => product.files[i]) },
        expires_at: check.row.expires_at,
        redirect_text: som.redirect_text, redirect_time: som.redirect_time,
        file_urls: check.row.file_indices.map((i: number) => `/api/downloads/file?token=${token}&f=${i}`),
        zip_url: check.row.file_indices.length > 1 ? `/api/downloads/file?token=${token}&zip=1` : null,
    });
}
