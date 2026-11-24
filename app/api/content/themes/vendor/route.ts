import { fail, ok, readBody, auth } from "@/lib/api";
import { getVendorConfig, setVendorBase } from "@/lib/theme/vendor";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read/set the vendor address and show this install's identity + recent vendor
// installs, so an operator can confirm everything is wired up.
export async function GET() {
    const { res } = await auth("administrator");
    if (res)
        return res;
    const { base, fingerprint } = await getVendorConfig();
    const installs = await getDb().many(
        "SELECT slug,install_class,serial,host,status,detail,installed_at FROM theme_installations ORDER BY id DESC LIMIT 20",
    );
    return ok({ vendor_base: base, fingerprint, installs });
}

export async function POST(req: Request) {
    const { res } = await auth("administrator");
    if (res)
        return res;
    const body = await readBody(req);
    try {
        await setVendorBase(String(body.vendor_base || ""));
        const { base, fingerprint } = await getVendorConfig();
        return ok({
            vendor_base: base,
            fingerprint,
            message: base ? "Vendor address saved." : "Vendor address cleared. Packages can still be uploaded manually.",
        });
    }
    catch (error: any) {
        return fail(String(error?.message || error));
    }
}
