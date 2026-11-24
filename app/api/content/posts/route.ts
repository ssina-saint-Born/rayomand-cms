import { handleList, handleCreate } from "@/lib/api-posts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
    return (await handleList(req, "post"));
}
export async function POST(req: Request) {
    return (await handleCreate(req, "post"));
}
