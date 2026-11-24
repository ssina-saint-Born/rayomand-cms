import { handleTermPatch, handleTermDelete } from "@/lib/api-terms";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function PATCH(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    return (await handleTermPatch(Number(params.id), req));
}
export async function DELETE(_req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    return (await handleTermDelete(Number(params.id)));
}
