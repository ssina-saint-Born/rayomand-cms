import { handleGet, handlePatch, handleDelete } from "@/lib/api-posts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    return (await handleGet(Number(params.id)));
}
export async function PATCH(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    return (await handlePatch(Number(params.id), req));
}
export async function DELETE(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    return (await handleDelete(Number(params.id), req));
}
