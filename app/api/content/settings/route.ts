import { getSettings, setOption, getAllOptions } from "@/lib/options";
import { ok, fail, readBody, auth } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const WRITABLE = [
    "site_title", "tagline", "admin_email", "theme",
    "posts_per_page", "default_comment_status", "comment_moderation",
    "date_format", "time_format", "timezone", "show_on_front", "page_on_front",
    "page_for_posts", "blog_public", "users_can_register", "default_role", "site_icon",
    "default_category", "default_post_format", "privacy_page_id",
    "site_url", "default_og_image", "twitter_site", "organization_name",
    "organization_logo", "social_profiles", "search_verification_google",
    "search_verification_bing", "seo_title_separator",
];
export async function GET() {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    return ok((await getSettings()));
}
export async function POST(req: Request) {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const body = await readBody(req);
    for (const key of WRITABLE) {
        if (body[key] === undefined)
            continue;
        const v = typeof body[key] === "boolean" ? (body[key] ? "1" : "0") : body[key];
        (await setOption(key, String(v)));
    }
    return ok((await getSettings()));
}
