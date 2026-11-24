import { redirect } from "next/navigation";
import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    await clearSessionCookie();
    redirect("/auth/sign-in");
}

export async function POST() {
    await clearSessionCookie();
    redirect("/auth/sign-in");
}
