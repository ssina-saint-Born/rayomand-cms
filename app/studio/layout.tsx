import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AdminFrame from "@/components/admin/AdminFrame";
export const dynamic = "force-dynamic";
// The workspace keeps its own product title so the public site title never
// leaks into the admin browser tab.
export const metadata: Metadata = {
    title: { default: "Rayomand CMS", absolute: "Rayomand CMS" },
};
export default async function AdminLayout({ children, }: {
    children: React.ReactNode;
}) {
    const user = (await currentUser());
    if (!user)
        redirect("/auth/sign-in");
    return <AdminFrame user={user}>{children}</AdminFrame>;
}
