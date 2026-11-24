import { ok, fail, readBody } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { addReview } from "@/lib/shop/people";
import { getShopSettings } from "@/lib/shop/core";
import { getProduct } from "@/lib/shop/products";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
    const s = (await getShopSettings());
    if (!s.enable_reviews)
        return fail("Reviews are disabled.");
    const body = await readBody(req);
    const user = (await currentUser());
    const product = (await getProduct(Number(body.product_id)));
    if (!product)
        return fail("Product not found.", 404);
    const name = user ? user.display_name : String(body.author_name || "").trim();
    const email = user ? user.email : String(body.author_email || "").trim();
    if (!name || !email)
        return fail("Name and email are required.");
    if (s.review_rating_required && !body.rating)
        return fail("Please select a rating.");
    try {
        const review = (await addReview({ productId: product.id, userId: user?.id, authorName: name, authorEmail: email, rating: Number(body.rating || 5), content: String(body.content || "") }));
        return ok(review, 201);
    }
    catch (e: any) {
        return fail(e.message);
    }
}
