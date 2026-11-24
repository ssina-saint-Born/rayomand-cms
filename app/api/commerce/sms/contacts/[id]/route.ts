import { ok, fail, auth, readBody, num } from "@/lib/api";
import { updateContact } from "@/lib/shop/sms-newsletter";
import { deleteContacts } from "@/lib/shop/sms-newsletter";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const id = Number(params.id);
    if (!id)
        return fail("Contact not found.", 404);
    const row = await (await import("@/lib/db")).getDb().one(
        "SELECT c.*, p.name AS product_name FROM sms_contacts c LEFT JOIN products p ON p.id=c.product_id WHERE c.id=$1", id,
    );
    if (!row)
        return fail("Contact not found.", 404);
    return ok(row);
}
export async function PATCH(req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const body = await readBody(req);
    const saved = await updateContact({ id: Number(params.id), mobile: body.mobile, groups: body.groups });
    if (!saved)
        return fail("A mobile number and at least one group are required.");
    return ok({ saved: true });
}
export async function DELETE(_req: Request, { params }: {
    params: {
        id: string;
    };
}) {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    return ok({ deleted: (await deleteContacts([Number(params.id)])) });
}
