import { fail, ok, readBody, auth } from "@/lib/api";
import { headers } from "next/headers";
import { getVendorConfig, activateSerial, fetchPackage, logVendorInstall } from "@/lib/theme/vendor";
import { installPackage } from "@/lib/theme/install";
import { PackageError } from "@/lib/theme/package";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Redeem a serial: contact the vendor, download the purchased frontend, verify
// every hash, and install it. This is the CMS acting as a *consumer*. It never
// holds premium packages or a signing key — only the public key for the local
// pre-check, and whatever the vendor hands back for this one install.

function requestHost(): string {
    const h = headers();
    return (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim().split(":")[0];
}

export async function POST(req: Request) {
    const { res } = await auth("administrator");
    if (res)
        return res;

    const body = await readBody(req);
    const serial = String(body.serial || "").trim();
    if (!serial)
        return fail("Enter the serial you received with your purchase.");

    const host = requestHost();
    const { fingerprint } = await getVendorConfig();

    const activation = await activateSerial(serial, host);
    if (!activation.ok) {
        if (activation.reason === "offline")
            return fail(activation.message || "No vendor is configured.", 409);
        await logVendorInstall("", "", serial, host, fingerprint, "activation_failed", activation.message || "");
        return fail(activation.message || "The serial could not be activated.", 403);
    }

    let pkg;
    try {
        pkg = await fetchPackage(activation.downloadUrl!);
    }
    catch (error) {
        const message = error instanceof PackageError ? error.message : `Download failed: ${String(error)}`;
        await logVendorInstall("", "", serial, host, fingerprint, "download_failed", message);
        return fail(message, 502);
    }

    const result = await installPackage(pkg, {
        serial,
        host,
        confirmServerCode: body.confirm_server_code === true,
    });
    await logVendorInstall(pkg.manifest.slug, pkg.manifest.install_class, serial, host, fingerprint, result.status, result.message);

    if (result.status === "pending_confirmation")
        return ok({ ...result, theme: activation.theme, needs_confirmation: true }, 202);
    if (!result.ok)
        return fail(result.message, 400);
    return ok({ ...result, theme: activation.theme });
}
