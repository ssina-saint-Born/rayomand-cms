import { listTerms, getTerm, createTerm, updateTerm, deleteTerm } from "./terms";
import { ok, fail, readBody, auth } from "./api";
type Tax = "category" | "tag";
export async function handleTermList(tax: Tax): Promise<Response> {
    return ok((await listTerms(tax)));
}
export async function handleTermCreate(tax: Tax, req: Request): Promise<Response> {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    const body = await readBody(req);
    if (!body.name)
        return fail("Name is required");
    const id = (await createTerm({
        taxonomy: tax,
        name: body.name,
        slug: body.slug,
        description: body.description,
        parent_id: body.parent_id,
    }));
    return ok((await getTerm(id)), 201);
}
export async function handleTermPatch(id: number, req: Request): Promise<Response> {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    if (!(await getTerm(id)))
        return fail("Not found", 404);
    const body = await readBody(req);
    (await updateTerm(id, body));
    return ok((await getTerm(id)));
}
export async function handleTermDelete(id: number): Promise<Response> {
    const { res } = (await auth("editor"));
    if (res)
        return res;
    if (!(await getTerm(id)))
        return fail("Not found", 404);
    (await deleteTerm(id));
    return ok({ deleted: true, id });
}
