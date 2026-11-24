import { handleTermList, handleTermCreate } from "@/lib/api-terms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    return (await handleTermList("category"));
}
export async function POST(req: Request) {
    return (await handleTermCreate("category", req));
}
