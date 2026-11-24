import { currentUser } from "@/lib/auth";
import { ok } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    return ok({ user: (await currentUser()) });
}
