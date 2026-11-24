import { auth } from "@/lib/api";
import { collectUsers } from "@/lib/access/export-users";
import { buildXlsx } from "@/lib/access/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
    administrator: "مدیر",
    editor: "ویرایشگر",
    author: "نویسنده",
    contributor: "مشارکت‌کننده",
    subscriber: "مشترک",
    customer: "مشتری",
};

function fmtDate(iso: string): string {
    if (!iso)
        return "";
    const d = new Date(iso);
    if (isNaN(d.getTime()))
        return iso;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function nowStamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export async function GET(req: Request) {
    const { user, res } = await auth("administrator");
    if (res)
        return res;

    const url = new URL(req.url);
    const q = url.searchParams;
    const users = await collectUsers({
        s: q.get("s") || undefined,
        role: q.get("role") || undefined,
        orderby: q.get("orderby") || undefined,
        order: q.get("order") || undefined,
    });

    const meta: [string, string][] = [
        ["افزونه:", "پینوا"],
        ["زمان:", nowStamp()],
        ["توسط:", user?.display_name || "-"],
    ];
    if (q.get("s"))
        meta.push(["جست‌و‌جو:", String(q.get("s"))]);
    if (q.get("role"))
        meta.push(["نقش کاربر:", ROLE_LABELS[String(q.get("role"))] || String(q.get("role"))]);
    if (q.get("orderby")) {
        const map: Record<string, string> = { login: "نام کاربری", email: "ایمیل", name: "نام", registered: "زمان ثبت نام", display_name: "نام نمایشی", id: "شناسه" };
        meta.push(["مرتب‌سازی بر اساس:", map[String(q.get("orderby")).toLowerCase()] || String(q.get("orderby"))]);
    }
    if (q.get("order"))
        meta.push(["نوع مرتب‌سازی:", String(q.get("order")).toLowerCase() === "desc" ? "نزولی" : "صعودی"]);

    const buffer = buildXlsx({
        columns: [
            { label: "شناسه" },
            { label: "نام کاربری" },
            { label: "تلفن همراه" },
            { label: "ایمیل" },
            { label: "نام نمایشی" },
            { label: "نقش (ها)" },
            { label: "زمان ثبت نام" },
        ],
        meta,
        ltrColumns: [1, 2, 3],
        rows: users.map((u) => [
            u.id,
            u.username,
            u.mobile || "",
            u.email.endsWith("@access.local") ? "" : u.email,
            u.display_name,
            ROLE_LABELS[u.role] || u.role,
            fmtDate(u.created_at),
        ]),
    });

    const filename = `sentinel-exported-users-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(buffer, {
        headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
}
