import { handleTermList, handleTermCreate } from "@/lib/api-terms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    return (await handleTermList("tag"));
}
export async function POST(req: Request) {
    return (await handleTermCreate("tag", req));
}
