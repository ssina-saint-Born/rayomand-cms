import crypto from "node:crypto";
import { getOption, setOption } from "@/lib/options";
import { verifyLicense } from "./license";
import { getDb, now } from "@/lib/db";
import { parsePackage, PackageError, type ParsedPackage } from "./package";

// Vendor client. The CMS is the consumer of frontend packages: the operator
// buys a frontend from a vendor's storefront, receives a serial, and enters it
// here. We send the serial plus this install's identity to the vendor, get back
// a short-lived download token, fetch the package, verify every hash, and hand
// it to the install engine. Nothing is installed until the download is checked.
//
// The vendor base URL is configurable so a self-hoster can point at any
// storefront that implements the three-endpoint contract; it defaults to empty
// (feature off) rather than a hard-coded third party.

export const VENDOR_BASE_OPTION = "theme_vendor_base";
export const VENDOR_FINGERPRINT_OPTION = "theme_install_fingerprint";

export interface VendorConfig {
    base: string;
    fingerprint: string;
}

export async function getVendorConfig(): Promise<VendorConfig> {
    const base = (await getOption(VENDOR_BASE_OPTION, "")).trim().replace(/\/+$/, "");
    let fingerprint = await getOption(VENDOR_FINGERPRINT_OPTION, "");
    if (!fingerprint) {
        fingerprint = crypto.randomBytes(18).toString("hex");
        await setOption(VENDOR_FINGERPRINT_OPTION, fingerprint);
    }
    return { base, fingerprint };
}

export async function setVendorBase(base: string): Promise<void> {
    const clean = base.trim().replace(/\/+$/, "");
    if (clean && !/^https?:\/\//.test(clean))
        throw new Error("The vendor address must start with http:// or https://.");
    await setOption(VENDOR_BASE_OPTION, clean);
}

export function cmsVersion(): string {
    return process.env.CMS_VERSION || "1.0.0";
}

export interface ActivationResult {
    ok: boolean;
    reason?: "offline" | "serial" | "install_limit" | "network" | "vendor" | "signature";
    message?: string;
    token?: string;
    downloadUrl?: string;
    theme?: string;
    expiresAt?: string;
}

// Step 1: turn a serial into a short-lived download token.
export async function activateSerial(serial: string, host: string): Promise<ActivationResult> {
    // Local signature check first: a malformed or expired serial never leaves
    // the server, so an obvious typo gives instant feedback.
    const local = verifyLicense(serial.trim(), { host });
    if (!local.ok && local.reason === "expired")
        return { ok: false, reason: "serial", message: "This serial has expired." };

    const { base, fingerprint } = await getVendorConfig();
    if (!base) {
        // No vendor configured: the package must be uploaded manually. This is
        // not an error — the CMS works fully without a vendor.
        return { ok: false, reason: "offline", message: "No vendor address is configured. Upload the package manually, or set the vendor address in Studio → Appearance." };
    }

    let response: Response;
    try {
        response = await fetch(`${base}/api/license/activate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                serial: serial.trim(),
                host,
                fingerprint,
                cms_version: cmsVersion(),
            }),
            signal: AbortSignal.timeout(15_000),
        });
    }
    catch (error: any) {
        return { ok: false, reason: "network", message: `Could not reach the vendor: ${error?.message || error}` };
    }

    const data: any = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
        const reason: ActivationResult["reason"] =
            data.reason === "install_limit" ? "install_limit"
                : data.reason === "signature" ? "signature"
                    : "serial";
        return { ok: false, reason, message: data.message || `The vendor rejected the serial (HTTP ${response.status}).` };
    }
    if (!data.token || !data.download_url)
        return { ok: false, reason: "vendor", message: "The vendor response was incomplete." };
    return {
        ok: true,
        token: String(data.token),
        downloadUrl: /^https?:\/\//.test(data.download_url) ? String(data.download_url) : `${base}${String(data.download_url)}`,
        theme: data.theme ? String(data.theme) : undefined,
        expiresAt: data.expires_at ? String(data.expires_at) : undefined,
    };
}

// Step 2: fetch and validate the package the token points at.
export async function fetchPackage(downloadUrl: string): Promise<ParsedPackage> {
    let response: Response;
    try {
        response = await fetch(downloadUrl, { signal: AbortSignal.timeout(60_000) });
    }
    catch (error: any) {
        throw new PackageError(`Could not download the package: ${error?.message || error}`, "network");
    }
    if (!response.ok)
        throw new PackageError(`The vendor returned HTTP ${response.status} for the download.`, "download");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 256 * 1024 * 1024)
        throw new PackageError("The package is larger than the 256 MB limit.", "size");
    return parsePackage(buffer);
}

export interface VendorInstallResult {
    ok: boolean;
    installClass?: string;
    slug?: string;
    message: string;
    status?: string;
}

export async function logVendorInstall(slug: string, installClass: string, serial: string, host: string, fingerprint: string, status: string, detail: string): Promise<void> {
    await getDb().execute(
        `INSERT INTO theme_installations (slug,install_class,serial,host,fingerprint,source,status,detail,installed_at)
         VALUES ($1,$2,$3,$4,$5,'vendor',$6,$7,$8)`,
        slug, installClass, serial, host, fingerprint, status, detail, now(),
    );
}
