import { ok, fail, readBody } from "@/lib/api";
import { getTranslator } from "@/lib/i18n-server";
import { getDb, withTransaction } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { getDownloadsSettings, getShopSettings } from "@/lib/shop/core";
import { getProduct } from "@/lib/shop/products";
import { captureEmail, captureRequired, checkLimit, createToken, indyFor, isFreeDownloadOffer, offerState, sendDownloadLinkEmail, trackDownload } from "@/lib/shop/downloads";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
    const tr = getTranslator();
    return withTransaction(async () => {
        const body = await readBody(req);
        const woo = (await getShopSettings());
        const som = (await getDownloadsSettings());
        if (!woo.enable_downloads)
            return fail("Downloads are disabled on this site.");
        const user = (await currentUser());
        const me = user ? { id: user.id, username: user.username, email: user.email, role: user.role } : null;
        const product = (await getProduct(Number(body.product_id)));
        if (!product)
            return fail("Product not found.", 404);
        const variation = body.variation_id ? (await getProduct(Number(body.variation_id))) : null;
        if (body.variation_id && (!variation || variation.type !== "variation" || variation.parent_id !== product.id))
            return fail("Invalid product variation.");
        const target = variation || product;
        const state = (await offerState(target, me, som, String(body.email || "")));
        if (target.status !== "publish" || !state.offered)
            return fail("This file is not available to download.");
        if (variation && !(await offerState(product, me, som)).offered)
            return fail("This product is not available to download.");
        if (state.requireLogin)
            return Response.json({ error: tr(state.loginMessage), message_key: state.loginMessage, require_login: true }, { status: 403 });
        let email = String(body.email || "").trim().toLowerCase();
        if (captureRequired(product, me, som)) {
            if (!email)
                return Response.json({ capture_required: true, error: tr(String(som.capture_email_error_none || "Please enter your email address.")), message_key: String(som.capture_email_error_none || "Please enter your email address.") }, { status: 400 });
            const cap = (await captureEmail(product, email, String(body.name || ""), som));
            if (!cap.ok)
                return fail(cap.error!);
        }
        if (!email && me)
            email = me.email;
        const indy = indyFor(product.id, som);
        const type = Number(indy.download_type ?? som.download_type_option ?? 0);
        if ((type === 1 || (som.download_limits_active && !me)) && !email)
            return Response.json({ capture_required: true, error: tr("Enter your email address to continue."), message_key: "Enter your email address to continue." }, { status: 400 });
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return fail("Please enter a valid email address.");
        await getDb().one("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", `download:${me ? `user:${me.id}` : `email:${email}`}`);
        const limit = (await checkLimit(product, me, email, som));
        if (!limit.allowed) {
            const redirect = som.basic_limit_error_redirect ? new URL(String(som.basic_limit_error_redirect), req.url) : null;
            return Response.json({ error: tr(limit.error!), message_key: limit.error, limit_reached: true, redirect_url: redirect?.origin === new URL(req.url).origin ? redirect.pathname + redirect.search : undefined }, { status: 403 });
        }
        const allFiles = target.files || [];
        if (!allFiles.length)
            return fail("No files are attached to this product.");
        let selected = allFiles;
        if (Array.isArray(body.files) && body.files.length) {
            if (body.files.some((i: unknown) => !Number.isInteger(i) || !allFiles[Number(i)]))
                return fail("Invalid file selection.");
            selected = Array.from(new Set<number>(body.files)).map((i) => allFiles[i]);
        }
        const forceZip = !!(indy.force_zip ?? som.force_zip) && selected.length > 1;
        const ip = req.headers.get("x-forwarded-for") || "local";
        const origin = new URL(req.url).origin;
        if (type === 1) {
            if (!email)
                return fail("An email address is required to send your download link.");
            const token = (await createToken(target, me, email, Number(som.email_expire_time || 24), 0, selected.map((f) => allFiles.indexOf(f))));
            try {
                await sendDownloadLinkEmail(target, email, token, som, origin);
            }
            catch (error: any) {
                await getDb().execute("DELETE FROM download_tokens WHERE token=$1", token);
                return fail(error.message, 503);
            }
            (await trackDownload(product, me, email, ip, "email-link", variation?.id || 0));
            return ok({ type: "email", message: `The mail server accepted your download link for ${email}. It expires in ${som.email_expire_time || 24} hours.` });
        }
        if (type === 2) {
            const page = new URL(String(som.redirect_page || "/files/ready"), origin);
            if (page.origin !== origin) return fail("The download page must be on this site.");
            const token = (await createToken(target, me, email, Number(som.redirect_expire_time || 24), 0, selected.map((f) => allFiles.indexOf(f))));
            (await trackDownload(product, me, email, ip, "redirect", variation?.id || 0));
            page.searchParams.set("token", token);
            return ok({ type: "redirect", url: page.pathname + page.search });
        }
        const token = (await createToken(target, me, email, 1, 0, selected.map((f) => allFiles.indexOf(f))));
        const fileUrl = (i: number) => `/api/downloads/file?token=${token}&f=${allFiles.indexOf(selected[i])}${body.view ? "&view=1" : ""}`;
        (await trackDownload(product, me, email, ip, "direct", variation?.id || 0));
        return ok({
            type: "direct",
            files: selected.map((f, i) => ({ name: f.name, url: fileUrl(i) })),
            zip: forceZip && !body.view ? { name: `${target.slug}.zip`, url: `/api/downloads/file?token=${token}&zip=1&files=${selected.map((f) => allFiles.indexOf(f)).join(",")}` } : null,
        });
    });
}
