import { mkdir, rm, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { normalizeTheme, toActiveTheme } from "./spec";
import { listPacks, savePacks, type StoredPack } from "./store";
import { getDb, now } from "@/lib/db";
import { cmsMajor, type ParsedPackage, type InstallClass } from "./package";

// Package install engine. A downloaded package is already hash-checked by
// parsePackage; this module turns it into a live theme according to its class:
//
//   t1  declarative  → stored as a theme pack, activated like an upload
//   t2  static       → files served from public/frontends/<slug>
//   t3  server       → recorded for the supervisor to run; needs explicit
//                      confirmation because it executes third-party code
//   t4  foreign      → rejected with an adapter explanation
//
// Every install writes a package_installs row and, on failure, leaves the
// previous state untouched (the caller passes the parsed package, so nothing
// touches the database until validation has passed).

export const FRONTEND_ROOT = path.join(process.cwd(), "public", "frontends");

export interface InstallOptions {
    /** For t3, the admin must confirm running third-party code. */
    confirmServerCode?: boolean;
    serial?: string;
    host?: string;
}

export interface InstallResult {
    ok: boolean;
    slug: string;
    installClass: InstallClass;
    status: "installed" | "pending_confirmation" | "rejected";
    message: string;
}

function cmsCompatible(cmsMajorRequired: number): boolean {
    // A package built for a newer major may use fields this CMS lacks.
    return cmsMajorRequired <= cmsMajor();
}

async function recordInstalled(pkg: ParsedPackage, status: string, log: string): Promise<void> {
    await getDb().execute(
        `INSERT INTO package_installs (slug,install_class,manifest,vendor,version,status,log,installed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        pkg.manifest.slug, pkg.manifest.install_class, JSON.stringify(pkg.manifest),
        "", pkg.manifest.version, status, log.slice(0, 8000), now(),
    );
}

export async function installPackage(pkg: ParsedPackage, opts: InstallOptions = {}): Promise<InstallResult> {
    const { manifest, files, theme } = pkg;
    const base = { slug: manifest.slug, installClass: manifest.install_class };

    if (!cmsCompatible(manifest.cms_major)) {
        return { ...base, ok: false, status: "rejected", message: `This package targets CMS v${manifest.cms_major}, newer than this installation (v${cmsMajor()}). Update the CMS first.` };
    }

    if (manifest.install_class === "t4") {
        return {
            ...base, ok: false, status: "rejected",
            message: "This package was built for a different CMS and cannot be installed automatically. Ask the vendor to ship a T2 (static) build, or follow the adapter checklist in the theme docs.",
        };
    }

    if (manifest.install_class === "t1") {
        if (!theme)
            return { ...base, ok: false, status: "rejected", message: "The package has no theme.json." };
        const packs = await listPacks();
        const existing = packs.find((p) => p.slug === theme.slug);
        const stored: StoredPack = {
            ...normalizeTheme(theme),
            license: manifest.license === "premium" ? "premium" : "free",
            product: undefined,
            installed_at: existing?.installed_at || now(),
        };
        const next = existing ? packs.map((p) => (p.slug === theme.slug ? stored : p)) : [...packs, stored];
        await savePacks(next);
        await recordInstalled(pkg, "installed", `Declarative pack ${theme.slug} installed.`);
        return { ...base, ok: true, status: "installed", message: `Theme "${stored.name}" installed. Open Appearance → Themes to activate it.` };
    }

    if (manifest.install_class === "t2") {
        if (!manifest.entry)
            return { ...base, ok: false, status: "rejected", message: "A static package must declare an entry file." };
        const dir = path.join(FRONTEND_ROOT, manifest.slug);
        // Install into a temp dir first, then swap, so a crash mid-write cannot
        // leave a half-installed frontend.
        const staging = `${dir}.staging-${Date.now()}`;
        try {
            for (const [name, bytes] of files) {
                const target = path.join(staging, name);
                const rel = path.relative(staging, target);
                if (rel.startsWith("..") || path.isAbsolute(rel))
                    throw new Error(`Unsafe path: ${name}`);
                await mkdir(path.dirname(target), { recursive: true });
                await writeFile(target, bytes, { mode: 0o644 });
            }
            // config.js lets the static app know where the CMS API lives.
            await writeFile(path.join(staging, "config.js"),
                `window.RAYOMAND_CONFIG=${JSON.stringify({ api_base: "/api/public", installed_at: now() })};\n`,
                { mode: 0o644 });
            await rm(dir, { recursive: true, force: true });
            await mkdir(path.dirname(dir), { recursive: true });
            await (await import("node:fs/promises")).rename(staging, dir);
        }
        catch (error: any) {
            await rm(staging, { recursive: true, force: true }).catch(() => { });
            return { ...base, ok: false, status: "rejected", message: `Static install failed: ${error?.message || error}` };
        }
        await recordInstalled(pkg, "installed", `Static frontend at /frontends/${manifest.slug}/${manifest.entry}`);
        return { ...base, ok: true, status: "installed", message: `Static frontend installed at /frontends/${manifest.slug}/.` };
    }

    // t3 — server-rendered. Executes third-party Node code, so it needs an
    // explicit admin confirmation and is recorded rather than auto-started.
    if (manifest.install_class === "t3") {
        if (!opts.confirmServerCode) {
            return {
                ...base, ok: false, status: "pending_confirmation",
                message: "This package runs its own Node server. Confirm that you trust the vendor before installing code that will execute on your server.",
            };
        }
        const dir = path.join(FRONTEND_ROOT, manifest.slug);
        const staging = `${dir}.staging-${Date.now()}`;
        try {
            for (const [name, bytes] of files) {
                const target = path.join(staging, name);
                const rel = path.relative(staging, target);
                if (rel.startsWith("..") || path.isAbsolute(rel))
                    throw new Error(`Unsafe path: ${name}`);
                await mkdir(path.dirname(target), { recursive: true });
                await writeFile(target, bytes, { mode: 0o644 });
            }
            await rm(dir, { recursive: true, force: true });
            await mkdir(path.dirname(dir), { recursive: true });
            await (await import("node:fs/promises")).rename(staging, dir);
        }
        catch (error: any) {
            await rm(staging, { recursive: true, force: true }).catch(() => { });
            return { ...base, ok: false, status: "rejected", message: `Server frontend install failed: ${error?.message || error}` };
        }
        await recordInstalled(pkg, "installed", `Server frontend written to public/frontends/${manifest.slug}. Start it with: ${manifest.start?.command} on port ${manifest.start?.port}.`);
        return {
            ...base, ok: true, status: "installed",
            message: `Server frontend installed. Start command: "${manifest.start?.command}" (internal port ${manifest.start?.port}). It runs under the restricted service user.`,
        };
    }

    return { ...base, ok: false, status: "rejected", message: "Unknown install class." };
}

export async function listInstalledFrontends(): Promise<{ slug: string; entry: string | null }[]> {
    try {
        const entries = await readdir(FRONTEND_ROOT, { withFileTypes: true });
        const out: { slug: string; entry: string | null }[] = [];
        for (const e of entries) {
            if (!e.isDirectory() || e.name.includes(".staging-"))
                continue;
            let entry: string | null = null;
            for (const candidate of ["index.html", "server.js"]) {
                try { await stat(path.join(FRONTEND_ROOT, e.name, candidate)); entry = candidate; break; } catch { }
            }
            out.push({ slug: e.name, entry });
        }
        return out;
    }
    catch {
        return [];
    }
}

export function activeThemeFromPack(pack: StoredPack) {
    return toActiveTheme(normalizeTheme(pack), "declarative");
}
