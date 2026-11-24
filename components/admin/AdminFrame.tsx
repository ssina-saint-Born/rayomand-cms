"use client";
import { useI18n } from "@/components/LanguageProvider";

import React, { createContext, useContext, useEffect, useState } from "react";
import BrandMark from "@/components/BrandMark";
import LanguageSwitch from "@/components/LanguageProvider";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@/lib/types";
import { ROLE_RANK } from "@/lib/types";
const AdminUserContext = createContext<User | null>(null);
export function useAdminUser(): User | null {
    return useContext(AdminUserContext);
}
function Icon({ name }: {
    name: string;
}) {
    const p: Record<string, React.ReactNode> = {
        dashboard: <><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></>,
        post: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></>,
        media: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></>,
        page: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></>,
        comment: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/></>,
        appearance: <><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18"/></>,
        plugin: <><path d="M12 2v6"/><path d="M8 8h8l1 6a5 5 0 0 1-10 0Z"/><path d="M12 19v3"/></>,
        user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
        shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/></>,
        tool: <><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-2.4Z"/></>,
        commerce: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></>,
        mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
        mobile: <><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></>,
        download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/></>,
        settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/></>,
    };
    return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {p[name] || p.dashboard}
    </svg>);
}
interface NavItem {
    label: string;
    href: string;
    icon: string;
    min: number;
    children?: {
        label: string;
        href: string;
    }[];
}
const NAV: NavItem[] = [
    { label: "Dashboard", href: "/studio", icon: "dashboard", min: 1, children: [{ label: "Home", href: "/studio" }, { label: "Updates", href: "/studio/updates" }] },
    { label: "Posts", href: "/studio/posts", icon: "post", min: 2, children: [{ label: "All Posts", href: "/studio/posts" }, { label: "Add New", href: "/studio/editor/new?type=post" }, { label: "Categories", href: "/studio/categories" }, { label: "Tags", href: "/studio/tags" }] },
    { label: "Media", href: "/studio/media", icon: "media", min: 3, children: [{ label: "Library", href: "/studio/media" }] },
    { label: "Pages", href: "/studio/pages", icon: "page", min: 4, children: [{ label: "All Pages", href: "/studio/pages" }, { label: "Add New", href: "/studio/editor/new?type=page" }] },
    { label: "Comments", href: "/studio/comments", icon: "comment", min: 4 },
    {
        label: "Commerce", href: "/studio/commerce", icon: "commerce", min: 4,
        children: [
            { label: "Home", href: "/studio/commerce" },
            { label: "Products", href: "/studio/commerce/products" },
            { label: "Orders", href: "/studio/commerce/orders" },
            { label: "Coupons", href: "/studio/commerce/coupons" },
            { label: "Shipping", href: "/studio/commerce/shipping" },
            { label: "Tax", href: "/studio/commerce/tax" },
            { label: "Customers", href: "/studio/commerce/customers" },
            { label: "Reviews", href: "/studio/commerce/reviews" },
            { label: "Reports", href: "/studio/commerce/reports" },
            { label: "SMS", href: "/studio/commerce/sms/settings" },
            { label: "Settings", href: "/studio/commerce/settings" },
        ],
    },
    {
        label: "Free Downloads", href: "/studio/downloads", icon: "download", min: 5,
        children: [
            { label: "Stats", href: "/studio/downloads" },
            { label: "Settings", href: "/studio/downloads/settings" },
            { label: "Subscribers", href: "/studio/downloads/subscribers" },
            { label: "Email Log", href: "/studio/downloads/emails" },
        ],
    },
    {
        label: "Content", href: "/studio/content-types", icon: "post", min: 4,
        children: [
            { label: "Content Types", href: "/studio/content-types" },
            { label: "Workflows", href: "/studio/workflows" },
            { label: "Moderation", href: "/studio/moderation" },
            { label: "Config", href: "/studio/config" },
            { label: "Views", href: "/studio/views" },
        ],
    },
    { label: "Appearance", href: "/studio/themes", icon: "appearance", min: 4, children: [{ label: "Themes", href: "/studio/themes" }, { label: "Menus", href: "/studio/menus" }] },
    { label: "Extensions", href: "/studio/extensions", icon: "plugin", min: 5, children: [{ label: "Installed extensions", href: "/studio/extensions" }] },
    { label: "Users", href: "/studio/users", icon: "user", min: 5, children: [{ label: "All Users", href: "/studio/users" }, { label: "Profile", href: "/studio/profile" }] },
    {
        label: "Sentinel Login", href: "/studio/access/settings", icon: "shield", min: 5,
        children: [
            { label: "Settings", href: "/studio/access/settings" },
            { label: "Blocked identifiers", href: "/studio/access/blocks" },
        ],
    },
    {
        label: "Mail", href: "/studio/mail", icon: "mail", min: 4,
        children: [
            { label: "Webmail", href: "/studio/mail/inbox" },
            { label: "Mail server", href: "/studio/mail/settings" },
        ]
    },
    { label: "Mobile", href: "/studio/mobile", icon: "mobile", min: 5, children: [{ label: "App & tokens", href: "/studio/mobile" }] },
    { label: "Tools", href: "/studio/tools", icon: "tool", min: 4, children: [{ label: "Available Tools", href: "/studio/tools" }] },
    { label: "Settings", href: "/studio/settings", icon: "settings", min: 5, children: [{ label: "General", href: "/studio/settings" }] },
];
export default function AdminFrame({ user, children, }: {
    user: User;
    children: React.ReactNode;
}) {
    const { t: tr } = useI18n();
    const pathname = usePathname();
    const router = useRouter();
    const [loggingOut, setLoggingOut] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const rank = ROLE_RANK[user.role];
    useEffect(() => {
        if (!mobileOpen)
            return;
        const drawer = document.getElementById("noma-navigation")!;
        const focusable = () => Array.from(drawer.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)"));
        focusable()[0]?.focus();
        const close = (event: KeyboardEvent) => {
            if (event.key === "Escape")
                setMobileOpen(false);
            if (event.key !== "Tab")
                return;
            const items = focusable();
            const first = items[0], last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
            }
            if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
            }
        };
        document.addEventListener("keydown", close);
        return () => {
            document.removeEventListener("keydown", close);
            document.getElementById("noma-menu-toggle")?.focus();
        };
    }, [mobileOpen]);
    async function logout() {
        setLoggingOut(true);
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/auth/sign-in");
        router.refresh();
    }
    const isActive = (href: string) => href === "/studio" ? pathname === "/studio" : pathname.startsWith(href);
    const sections = [
        { label: "Workspace", icons: ["dashboard", "post", "media", "page", "comment"] },
        { label: "Commerce", icons: ["commerce", "download"] },
        { label: "Mail", icons: ["mail"] },
        { label: "Manage", icons: ["appearance", "plugin", "user", "shield", "tool", "settings"] },
    ];
    const current = NAV.find((n) => isActive(n.href));
    return (<AdminUserContext.Provider value={user}>
      <div className="noma-admin">
        <a className="noma-skip-link" href="#noma-main">{tr("Skip to content")}</a>
        {mobileOpen && <button className="noma-mobile-scrim" aria-label={tr("Close navigation")} tabIndex={-1} onClick={() => setMobileOpen(false)}/>}
        <aside id="noma-navigation" className="noma-drawer" data-open={mobileOpen} aria-label={tr("Workspace navigation")}>
          <div className="noma-drawer-brand">
            <BrandMark />
            <div><strong>{tr("Rayomand CMS")}</strong><p className="noma-eyebrow mt-0.5">{tr("Creative workspace")}</p></div>
          </div>
          <button className="noma-icon-button noma-drawer-close" aria-label={tr("Close navigation")} onClick={() => setMobileOpen(false)}>×</button>
          <nav className="noma-drawer-nav">
            {sections.map((section) => {
            const items = NAV.filter((n) => rank >= n.min && section.icons.includes(n.icon));
            if (!items.length)
                return null;
            return (<div key={section.label}>
                  <p className="noma-nav-group noma-eyebrow">{tr(section.label)}</p>
                  {items.map((n) => (<div key={n.href}>
                      <Link href={n.href} className="noma-nav-link" data-active={isActive(n.href)} aria-current={pathname === n.href ? "page" : undefined} onClick={() => setMobileOpen(false)}>
                        <Icon name={n.icon}/><span>{tr(n.label)}</span>
                        {isActive(n.href) && <span className="noma-nav-indicator" aria-hidden="true"/>}
                      </Link>
                      {isActive(n.href) && n.children && (<div className="noma-subnav">
                          {n.children.map((c) => (<Link key={c.href} href={c.href} aria-current={pathname === c.href ? "page" : undefined} onClick={() => setMobileOpen(false)}>{tr(c.label)}</Link>))}
                        </div>)}
                    </div>))}
                </div>);
        })}
          </nav>
          <div className="noma-drawer-footer"><span><span className="noma-status-dot"/>{tr("Local workspace")}</span><span>{tr("Rayomand CMS 1.0")}</span></div>
        </aside>
        <div className="noma-admin-body">
          <header className="noma-appbar">
            <div className="flex items-center gap-3 min-w-0">
              <button id="noma-menu-toggle" className="noma-icon-button noma-menu-toggle" aria-label={tr("Open navigation")} aria-controls="noma-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
              </button>
              <div><p className="noma-eyebrow">{tr("Workspace /")}{" "}{tr(current?.label || "Studio")}</p><p className="noma-appbar-title">{tr("Make room for your ideas.")}</p></div>
            </div>
            <div className="flex items-center gap-3 text-[13px]">
              <LanguageSwitch />
              <Link href="/" aria-label={tr("View site")} className="rm-btn rm-btn-secondary"><Icon name="page"/><span className="noma-appbar-site-label">{tr("View site")}</span></Link>
              <span className="noma-appbar-user-name text-rm-muted">{user.display_name}</span>
              <span className="noma-avatar" aria-hidden="true">{user.display_name.slice(0, 1).toUpperCase()}</span>
              <button onClick={logout} disabled={loggingOut} className="rm-btn rm-btn-ghost">{loggingOut ? tr("Signing out…") : tr("Sign out")}</button>
            </div>
          </header>
          <main id="noma-main" className="noma-admin-main" tabIndex={-1}>{children}</main>
        </div>
      </div>
    </AdminUserContext.Provider>);
}
