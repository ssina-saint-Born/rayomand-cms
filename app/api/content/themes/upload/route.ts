import { fail, ok, auth } from "@/lib/api";
import { parsePackage, PackageError } from "@/lib/theme/package";
import { installPackage } from "@/lib/theme/install";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual install path, for an operator who has the ZIP in hand (offline, or the
// vendor emailed the file). Same validation and install engine as the serial
// flow; the difference is only where the bytes come from.
export async function POST(req: Request) {
    const { res } = await auth("administrator");
    if (res)
        return res;

    const form = await req.formData().catch(() => null);
    if (!form)
        return fail("Upload the package as multipart form data.");
    const file = form.get("file");
    if (!(file instanceof File))
        return fail("Attach the package ZIP.");
    if (file.size > 256 * 1024 * 1024)
        return fail("The package is larger than the 256 MB limit.");

    const buffer = Buffer.from(await file.arrayBuffer());
    let pkg;
    try {
        pkg = parsePackage(buffer);
    }
    catch (error) {
        const message = error instanceof PackageError ? error.message : `Invalid package: ${String(error)}`;
        return fail(message);
    }

    const result = await installPackage(pkg, { confirmServerCode: String(form.get("confirm_server_code") || "") === "true" });
    if (result.status === "pending_confirmation")
        return ok({ ...result, needs_confirmation: true }, 202);
    if (!result.ok)
        return fail(result.message);
    return ok(result);
}
