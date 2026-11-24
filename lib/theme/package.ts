import crypto from "node:crypto";
import zlib from "node:zlib";
import { normalizeTheme, type DeclarativeTheme } from "./spec";
import { buildZip } from "@/lib/shop/zip";

// Frontend package format v1.
//
// A vendor sells a frontend as a ZIP whose `manifest.json` names the install
// class and carries a SHA-256 for every other file. The CMS is the consumer:
// it downloads the archive, checks the manifest, verifies every hash, and only
// then installs. Nothing here trusts the vendor beyond the signature check the
// caller performs on the serial.

export const PACKAGE_FORMAT = 1;

export type InstallClass = "t1" | "t2" | "t3" | "t4";

export const INSTALL_CLASS_LABEL: Record<InstallClass, string> = {
    t1: "Declarative theme (theme.json)",
    t2: "Prebuilt static frontend",
    t3: "Server-rendered frontend (Node)",
    t4: "Raw frontend for another CMS (needs an adapter)",
};

export interface PackageManifest {
    format: number;
    slug: string;
    name: string;
    version: string;
    install_class: InstallClass;
    /** CMS major version this package was built against. */
    cms_major: number;
    description?: string;
    author?: string;
    license?: string;
    /** Relative entrypoint for t2/t3 (e.g. "index.html", "server.js"). */
    entry?: string;
    /** Command and port for t3. */
    start?: { command: string; port: number; env?: Record<string, string> };
    /** SHA-256 (hex) of every payload file, keyed by its path in the archive. */
    files: Record<string, string>;
}

export interface ParsedPackage {
    manifest: PackageManifest;
    /** Payload files, excluding manifest.json itself. */
    files: Map<string, Buffer>;
    /** Present for t1 packages. */
    theme: DeclarativeTheme | null;
}

export class PackageError extends Error {
    constructor(message: string, readonly reason: string) {
        super(message);
    }
}

// ── ZIP reading ─────────────────────────────────────────────────────────────

const MAX_ENTRIES = 5000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

function findEocd(buf: Buffer): number {
    const min = Math.max(0, buf.length - 65557);
    for (let i = buf.length - 22; i >= min; i--) {
        if (buf.readUInt32LE(i) === 0x06054b50)
            return i;
    }
    return -1;
}

function safeEntryName(name: string): string {
    const normalized = name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!normalized || normalized.endsWith("/"))
        return "";
    if (normalized.split("/").some((part) => part === ".." || part === "." || part === ""))
        throw new PackageError(`Unsafe path in package: ${name}`, "path");
    if (/^[a-zA-Z]:/.test(normalized))
        throw new PackageError(`Absolute path in package: ${name}`, "path");
    return normalized;
}

/** Read a ZIP archive into a path → bytes map. Stored and deflated entries only. */
export function readZip(buf: Buffer): Map<string, Buffer> {
    const eocd = findEocd(buf);
    if (eocd < 0)
        throw new PackageError("The archive is not a valid ZIP file.", "zip");
    const total = buf.readUInt16LE(eocd + 10);
    if (total > MAX_ENTRIES)
        throw new PackageError("The archive contains too many files.", "zip");
    let offset = buf.readUInt32LE(eocd + 16);
    const out = new Map<string, Buffer>();
    let totalBytes = 0;

    for (let n = 0; n < total; n++) {
        if (buf.readUInt32LE(offset) !== 0x02014b50)
            throw new PackageError("The archive directory is corrupt.", "zip");
        const method = buf.readUInt16LE(offset + 10);
        const compSize = buf.readUInt32LE(offset + 20);
        const uncompSize = buf.readUInt32LE(offset + 24);
        const nameLen = buf.readUInt16LE(offset + 28);
        const extraLen = buf.readUInt16LE(offset + 30);
        const commentLen = buf.readUInt16LE(offset + 32);
        const localOffset = buf.readUInt32LE(offset + 42);
        const rawName = buf.toString("utf8", offset + 46, offset + 46 + nameLen);
        offset += 46 + nameLen + extraLen + commentLen;

        const name = safeEntryName(rawName);
        if (!name)
            continue;
        if (uncompSize > MAX_FILE_BYTES)
            throw new PackageError(`File too large in package: ${name}`, "zip");
        totalBytes += uncompSize;
        if (totalBytes > MAX_TOTAL_BYTES)
            throw new PackageError("The archive expands beyond the size limit.", "zip");

        if (buf.readUInt32LE(localOffset) !== 0x04034b50)
            throw new PackageError("The archive entry is corrupt.", "zip");
        const localNameLen = buf.readUInt16LE(localOffset + 26);
        const localExtraLen = buf.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLen + localExtraLen;
        const data = buf.subarray(dataStart, dataStart + compSize);

        let bytes: Buffer;
        if (method === 0)
            bytes = Buffer.from(data);
        else if (method === 8)
            bytes = zlib.inflateRawSync(data, { maxOutputLength: MAX_FILE_BYTES });
        else
            throw new PackageError(`Unsupported compression in package: ${name}`, "zip");

        if (bytes.length !== uncompSize)
            throw new PackageError(`Size mismatch in package: ${name}`, "zip");
        out.set(name, bytes);
    }
    return out;
}

// ── Manifest ────────────────────────────────────────────────────────────────

export function sha256(buf: Buffer): string {
    return crypto.createHash("sha256").update(buf).digest("hex");
}

function asClass(value: unknown): InstallClass | null {
    return value === "t1" || value === "t2" || value === "t3" || value === "t4" ? value : null;
}

export function parseManifest(raw: unknown): PackageManifest {
    if (!raw || typeof raw !== "object")
        throw new PackageError("manifest.json is missing or not an object.", "manifest");
    const m = raw as Record<string, any>;
    if (Number(m.format) !== PACKAGE_FORMAT)
        throw new PackageError(`Unsupported package format. This CMS reads format ${PACKAGE_FORMAT}.`, "format");
    const slug = String(m.slug || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug))
        throw new PackageError("manifest.json has an invalid slug.", "slug");
    const installClass = asClass(m.install_class);
    if (!installClass)
        throw new PackageError("manifest.json has an invalid install_class.", "class");
    const files = m.files && typeof m.files === "object" ? m.files as Record<string, unknown> : null;
    if (!files)
        throw new PackageError("manifest.json must list its files with hashes.", "files");
    const hashes: Record<string, string> = {};
    for (const [path, hash] of Object.entries(files)) {
        if (!/^[a-f0-9]{64}$/.test(String(hash)))
            throw new PackageError(`manifest.json has an invalid hash for ${path}.`, "files");
        hashes[path] = String(hash);
    }
    const start = m.start && typeof m.start === "object"
        ? { command: String(m.start.command || ""), port: Number(m.start.port) || 0, env: m.start.env || {} }
        : undefined;
    return {
        format: PACKAGE_FORMAT,
        slug,
        name: String(m.name || slug),
        version: String(m.version || "1.0.0"),
        install_class: installClass,
        cms_major: Number(m.cms_major) || 1,
        description: m.description ? String(m.description) : undefined,
        author: m.author ? String(m.author) : undefined,
        license: m.license ? String(m.license) : undefined,
        entry: m.entry ? String(m.entry) : undefined,
        start,
        files: hashes,
    };
}

export function cmsMajor(): number {
    return Number((process.env.CMS_VERSION || "1.0.0").split(".")[0]) || 1;
}

/** Read, validate and hash-check an archive. Throws PackageError on any defect. */
export function parsePackage(buf: Buffer): ParsedPackage {
    const entries = readZip(buf);
    const manifestRaw = entries.get("manifest.json");
    if (!manifestRaw)
        throw new PackageError("The package has no manifest.json.", "manifest");
    let json: unknown;
    try {
        json = JSON.parse(manifestRaw.toString("utf8"));
    }
    catch {
        throw new PackageError("manifest.json is not valid JSON.", "manifest");
    }
    const manifest = parseManifest(json);

    const listed = new Set(Object.keys(manifest.files));
    const files = new Map<string, Buffer>();
    for (const [path, bytes] of entries) {
        if (path === "manifest.json")
            continue;
        if (!listed.has(path))
            throw new PackageError(`Package contains an undeclared file: ${path}`, "extra");
        const expected = manifest.files[path];
        if (sha256(bytes) !== expected)
            throw new PackageError(`Hash mismatch for ${path}. The file was altered.`, "hash");
        files.set(path, bytes);
    }
    for (const path of listed) {
        if (!files.has(path))
            throw new PackageError(`Package is missing declared file: ${path}`, "missing");
    }

    let theme: DeclarativeTheme | null = null;
    if (manifest.install_class === "t1") {
        const themeRaw = files.get("theme.json");
        if (!themeRaw)
            throw new PackageError("A declarative package must contain theme.json.", "theme");
        try {
            theme = normalizeTheme(JSON.parse(themeRaw.toString("utf8")));
        }
        catch {
            throw new PackageError("theme.json is not valid JSON.", "theme");
        }
        if (theme.slug !== manifest.slug)
            throw new PackageError("theme.json slug does not match the manifest.", "theme");
    }
    if (manifest.install_class === "t3" && !manifest.start?.command)
        throw new PackageError("A server-rendered package must declare start.command.", "start");

    return { manifest, files, theme };
}

/** Build a package ZIP from payload files plus the descriptive fields. */
export function buildPackage(input: {
    slug: string;
    name: string;
    version: string;
    install_class: InstallClass;
    description?: string;
    author?: string;
    license?: string;
    entry?: string;
    start?: { command: string; port: number; env?: Record<string, string> };
    files: { name: string; data: Buffer }[];
}): Buffer {
    const hashes: Record<string, string> = {};
    const payload: { name: string; data: Buffer }[] = [];
    for (const f of input.files) {
        const name = safeEntryName(f.name);
        if (!name || name === "manifest.json")
            continue;
        hashes[name] = sha256(f.data);
        payload.push({ name, data: f.data });
    }
    const manifest: PackageManifest = {
        format: PACKAGE_FORMAT,
        slug: input.slug,
        name: input.name,
        version: input.version,
        install_class: input.install_class,
        cms_major: cmsMajor(),
        description: input.description,
        author: input.author,
        license: input.license,
        entry: input.entry,
        start: input.start,
        files: hashes,
    };
    return buildZip([
        { name: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2)) },
        ...payload,
    ]);
}
