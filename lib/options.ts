import { getDb } from "./db";
export async function getOption(name: string, fallback = ""): Promise<string> {
    const row = (await getDb().one("SELECT value FROM options WHERE name=$1", name)) as {
        value: string;
    } | undefined;
    return row ? row.value : fallback;
}
export async function setOption(name: string, value: string | number): Promise<void> {
    (await getDb().execute("INSERT INTO options (name,value) VALUES ($1,$2) ON CONFLICT (name) DO UPDATE SET value=EXCLUDED.value", name, String(value)));
}
export async function getAllOptions(): Promise<Record<string, string>> {
    const rows = (await getDb().many("SELECT name,value FROM options")) as {
        name: string;
        value: string;
    }[];
    const out: Record<string, string> = {};
    for (const r of rows)
        out[r.name] = r.value;
    return out;
}
export interface SiteSettings {
    site_title: string;
    tagline: string;
    admin_email: string;
    theme: string;
    permalink_structure: string;
    posts_per_page: number;
    default_comment_status: string;
    comment_moderation: boolean;
    date_format: string;
    time_format: string;
    timezone: string;
    show_on_front: string;
    page_on_front: string;
    page_for_posts: string;
    blog_public: boolean;
    users_can_register: boolean;
    default_role: string;
    site_icon: string;
    default_category: string;
    default_post_format: string;
    privacy_page_id: string;
    // SEO / technical metadata
    site_url: string;
    default_og_image: string;
    twitter_site: string;
    organization_name: string;
    organization_logo: string;
    social_profiles: string;
    search_verification_google: string;
    search_verification_bing: string;
    seo_title_separator: string;
}
export async function getSettings(): Promise<SiteSettings> {
    const o = (await getAllOptions());
    return {
        site_title: o.site_title || "Rayomand CMS",
        tagline: o.tagline || "",
        admin_email: o.admin_email || "",
        theme: o.theme || "twentytwentyfive",
        permalink_structure: "/read/{slug}",
        posts_per_page: parseInt(o.posts_per_page || "10", 10),
        default_comment_status: o.default_comment_status || "open",
        comment_moderation: o.comment_moderation === "1",
        date_format: o.date_format || "F j, Y",
        time_format: o.time_format || "g:i a",
        timezone: o.timezone || "UTC",
        show_on_front: o.show_on_front || "posts",
        page_on_front: o.page_on_front || "",
        page_for_posts: o.page_for_posts || "",
        blog_public: o.blog_public !== "0",
        users_can_register: o.users_can_register === "1",
        default_role: o.default_role || "subscriber",
        site_icon: o.site_icon || "",
        default_category: o.default_category || "",
        default_post_format: o.default_post_format || "standard",
        privacy_page_id: o.privacy_page_id || "",
        site_url: o.site_url || "",
        default_og_image: o.default_og_image || "",
        twitter_site: o.twitter_site || "",
        organization_name: o.organization_name || "",
        organization_logo: o.organization_logo || "",
        social_profiles: o.social_profiles || "",
        search_verification_google: o.search_verification_google || "",
        search_verification_bing: o.search_verification_bing || "",
        seo_title_separator: o.seo_title_separator || "·",
    };
}
