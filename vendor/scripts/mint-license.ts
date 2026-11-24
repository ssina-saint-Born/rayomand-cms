import fs from "node:fs";
import crypto from "node:crypto";
import { mintSerial, verifyLicense, type LicensePayload } from "../../lib/theme/license";

// Vendor tool: mint a serial to hand to a customer after a theme purchase.
// The private key never ships with the CMS; pass it via THEME_SIGNING_KEY (a
// path to a PEM file) so this only runs on the vendor's machine.
//
//   THEME_SIGNING_KEY=./private.pem npx tsx scripts/mint-license.ts \
//     --product aurora --theme aurora --days 365 --sites 1 [--host example.com]
//
// A perpetual license omits --days. `--product '*'` unlocks every theme.

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function main() {
    const keyPath = process.env.THEME_SIGNING_KEY;
    if (!keyPath || !fs.existsSync(keyPath)) {
        console.error("Set THEME_SIGNING_KEY to the path of your Ed25519 private key (PEM).");
        process.exit(1);
    }
    const product = arg("product");
    if (!product) {
        console.error("Pass --product <id> (or --product '*' for all themes).");
        process.exit(1);
    }
    const theme = arg("theme") || "";
    const days = parseInt(arg("days") || "0", 10);
    const sites = parseInt(arg("sites") || "1", 10);
    const host = arg("host") || "";
    const nowSec = Math.floor(Date.now() / 1000);

    const payload: LicensePayload = {
        s: crypto.randomBytes(8).toString("hex").toUpperCase(),
        p: product,
        t: theme,
        i: nowSec,
        e: days > 0 ? nowSec + days * 86400 : 0,
        n: sites,
        h: host,
    };

    const pem = fs.readFileSync(keyPath, "utf8");
    const serial = mintSerial(payload, pem);

    const check = verifyLicense(serial);
    if (!check.ok) {
        console.error("Minted serial failed self-verification:", check.message);
        process.exit(1);
    }

    console.log(JSON.stringify({
        serial,
        product,
        theme: theme || "(any)",
        expires_at: payload.e ? new Date(payload.e * 1000).toISOString() : "never",
        sites,
        host: host || "(unbound)",
    }, null, 2));
    console.log("\nCustomer activates it in Studio → Appearance → Themes → License, or opens the");
    console.log(`download link: /api/content/themes/bundle?serial=${encodeURIComponent(serial)}&theme=${theme || product}`);
}

main();
