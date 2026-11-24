import { verifyLicense, parseSerialMetadata } from "@/lib/theme/license";
import { listLicenses, saveLicenses, setEngineMode, listPacks, type EngineMode } from "@/lib/theme/store";
import { BUILTIN_SPECS } from "@/lib/theme/builtin";
import { ok, fail, readBody, auth } from "@/lib/api";
import { headers } from "next/headers";
import { now } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Serial inspection and offline license bookkeeping.
//
// Redeeming a purchased frontend is a different operation: it contacts the
// vendor, downloads the package and installs it (POST /api/content/themes/install).
// These endpoints only validate a serial and record/remove it locally, which is
// useful for auditing and for the "check before you buy" flow.

function requestHost(): string {
    const h = headers();
    return (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim();
}

async function knownProduct(product: string): Promise<{ slug: string; name: string } | null> {
    const specs = [...BUILTIN_SPECS, ...(await listPacks()).map((p) => p as any)];
    const match = specs.find((s: any) => s.product === product || s.slug === product);
    return match ? { slug: match.slug, name: match.name } : null;
}

export async function GET() {
    const { user, res } = await auth("administrator");
    if (res)
        return res;
    return ok({
        licenses: await listLicenses(),
        host: requestHost(),
    });
}

export async function POST(req: Request) {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const body = await readBody(req);
    const serial = String(body.serial || "");
    if (!serial.trim())
        return fail("Enter the serial you received with your purchase.");

    const host = requestHost();
    // Try a host-bound verification first; if the serial is unbound this passes
    // too. A host mismatch is reported so the buyer knows the license belongs
    // to another domain.
    const check = verifyLicense(serial, { host });
    if (!check.ok) {
        return fail(check.reason === "expired"
            ? "This license has expired."
            : check.reason === "host"
                ? `${check.message} Activate it on that domain, or ask the vendor for an unbound license.`
                : check.message);
    }

    const payload = check.payload;
    const known = await knownProduct(payload.p);
    if (payload.p !== "*" && !known)
        return fail("This serial is for a product that is not installed here.");

    const targetSlug = payload.t || known?.slug || payload.p;
    const licenses = await listLicenses();
    const entry = {
        product: payload.p,
        theme: payload.t || "",
        serial: String(serial).trim(),
        issued_at: new Date(payload.i * 1000).toISOString(),
        expires_at: check.expiresAt,
        perpetual: check.perpetual,
        host: check.host,
        activated_at: now(),
    };
    const next = licenses.filter((l) => l.serial !== entry.serial);
    next.push(entry);
    await saveLicenses(next);

    // Activating a license also turns off the "locked" headless banner.
    return ok({
        activated: true,
        product: payload.p,
        theme: targetSlug,
        expires_at: check.expiresAt,
        perpetual: check.perpetual,
        host: check.host,
    });
}

export async function DELETE(req: Request) {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const serial = new URL(req.url).searchParams.get("serial") || "";
    const licenses = await listLicenses();
    const next = licenses.filter((l) => l.serial !== serial);
    if (next.length === licenses.length)
        return fail("That license is not activated.", 404);
    await saveLicenses(next);
    return ok({ removed: serial });
}

// Validate without activating — used by the "check serial" button so an admin
// can inspect expiry/host before committing.
export async function PUT(req: Request) {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const body = await readBody(req);
    const serial = String(body.serial || "");
    const check = verifyLicense(serial, { host: requestHost() });
    if (!check.ok)
        return fail(check.message);
    const meta = parseSerialMetadata(serial);
    return ok({
        valid: true,
        product: check.payload.p,
        theme: check.payload.t || null,
        expires_at: check.expiresAt,
        perpetual: check.perpetual,
        sites: meta?.n ?? 1,
        host: check.host,
    });
}

export async function PATCH(req: Request) {
    const { res } = (await auth("administrator"));
    if (res)
        return res;
    const body = await readBody(req);
    const mode = String(body.engine || "") as EngineMode;
    if (!["declarative", "coded", "headless"].includes(mode))
        return fail("Choose an engine: declarative, coded, or headless.");
    await setEngineMode(mode);
    return ok({ engine: mode });
}
