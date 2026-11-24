import Link from "next/link";
import type { Post } from "@/lib/types";
import type { ActiveTheme } from "@/lib/theme/spec";
import { getTranslator } from "@/lib/i18n-server";
import ThemePostCard from "./theme/ThemePostCard";

export default function Archive({
    title,
    description,
    posts,
    theme,
    baseHref,
    page,
    totalPages,
}: {
    title: string;
    description?: string;
    posts: Post[];
    theme: ActiveTheme;
    baseHref: string;
    page: number;
    totalPages: number;
}) {
    const tr = getTranslator();
    const sep = baseHref.includes("?") ? "&" : "?";
    return (
        <div>
            <header style={{ marginBottom: 28, borderBottom: "1px solid var(--rm-theme-border)", paddingBottom: 16 }}>
                <h1 style={{ fontSize: "clamp(28px,3.6vw,40px)", fontWeight: 600, letterSpacing: "-0.04em" }}>{title}</h1>
                {description && <p style={{ color: "var(--rm-theme-muted)", marginTop: 8 }}>{description}</p>}
            </header>
            {posts.length === 0
                ? <p className="rm-theme-empty">{tr("Nothing found.")}</p>
                : posts.map((p) => <ThemePostCard key={p.id} post={p} theme={theme} />)}
            {totalPages > 1 && (
                <nav className="rm-theme-pagination" aria-label={tr("Pagination")}>
                    {page > 1 ? <Link href={`${baseHref}${sep}page=${page - 1}`}>← {tr("Previous")}</Link> : <span />}
                    <span>{tr("Page")} {page} {tr("of")} {totalPages}</span>
                    {page < totalPages ? <Link href={`${baseHref}${sep}page=${page + 1}`}>{tr("Next")} →</Link> : <span />}
                </nav>
            )}
        </div>
    );
}
