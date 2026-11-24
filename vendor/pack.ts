import fs from "node:fs";
import path from "node:path";
import { buildPackage, PACKAGE_FORMAT, type InstallClass } from "../lib/theme/package";

// Turn a product folder into a compliant Rayomand frontend package (format v1).
//
//   npx tsx vendor/pack.ts ./my-theme --slug aurora --name "Aurora" \
//     --class t1 --version 1.0.0 --out dist/aurora.zip
//
// The folder is read recursively. `manifest.json` is generated here, so a
// product folder must NOT contain one. Every file is hashed and listed.

function arg(name: string, fallback = ""): string {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

function walk(dir: string, base = dir): { name: string; data: Buffer }[] {
    const out: { name: string; data: Buffer }[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walk(full, base));
        }
        else if (entry.isFile()) {
            const rel = path.relative(base, full).split(path.sep).join("/");
            out.push({ name: rel, data: fs.readFileSync(full) });
        }
    }
    return out;
}

function main() {
    const folder = process.argv[2];
    if (!folder || folder.startsWith("--")) {
        console.error("Usage: npx tsx vendor/pack.ts <folder> --slug <slug> --name <name> --class <t1|t2|t3> [--version 1.0.0] [--out file.zip] [--entry index.html] [--start 'node server.js'] [--port 4173]");
        process.exit(1);
    }
    const slug = arg("slug");
    const name = arg("name", slug);
    const cls = arg("class") as InstallClass;
    if (!slug || !["t1", "t2", "t3", "t4"].includes(cls)) {
        console.error("--slug and a valid --class (t1/t2/t3/t4) are required.");
        process.exit(1);
    }
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
        console.error(`Folder not found: ${folder}`);
        process.exit(1);
    }
    const files = walk(folder);
    if (files.some((f) => f.name === "manifest.json")) {
        console.error("The folder already contains manifest.json; remove it — this tool generates the manifest.");
        process.exit(1);
    }
    if (cls === "t1" && !files.some((f) => f.name === "theme.json")) {
        console.error("A t1 package needs theme.json at the folder root.");
        process.exit(1);
    }

    const startCommand = arg("start");
    const zip = buildPackage({
        slug,
        name,
        version: arg("version", "1.0.0"),
        install_class: cls,
        entry: arg("entry"),
        description: arg("description"),
        author: arg("author"),
        license: arg("license"),
        start: startCommand ? { command: startCommand, port: Number(arg("port", "4173")) } : undefined,
        files,
    });

    const out = arg("out", path.join("dist", `${slug}.zip`));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, zip);
    console.log(`Wrote ${out} (${(zip.length / 1024).toFixed(1)} KB, format ${PACKAGE_FORMAT}, ${files.length} file(s), class ${cls}).`);
}

main();
