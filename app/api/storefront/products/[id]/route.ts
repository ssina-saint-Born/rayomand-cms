import { ok, fail } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { getProduct, listProducts } from "@/lib/shop/products";
import { offerState } from "@/lib/shop/downloads";
import { listReviews } from "@/lib/shop/people";
import { getDownloadsSettings } from "@/lib/shop/core";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const id = Number(params.id);
    const product = (await getProduct(Number.isNaN(id) ? params.id : id));
    if (!product || product.status !== "publish")
        return fail("Product not found.", 404);
    const user = (await currentUser());
    const som = (await getDownloadsSettings());
    const state = (await offerState(product, user ? { id: user.id, username: user.username, email: user.email, role: user.role } : null, som));
    const reviews = (await listReviews({ productId: product.id, status: "approved" }));
    const related = product.categories?.length
        ? (await listProducts({ category: String(product.categories[0].id), perPage: 4, exclude: [product.id], visibility: true })).items
        : [];
    return ok({ product, state, reviews, related, settings: { button_text: som.button_text, badge_text: som.badge_text, hide_badge: som.hide_badge, download_counts: som.download_counts, show_filename: som.show_filename, file_list_text: som.file_list_text, display_single: som.display_single, display_multi: som.display_multi, docviewer_enable: som.docviewer_enable, docviewer_link_text: som.docviewer_single_link_text, download_history_enable: som.download_history_enable } });
}
