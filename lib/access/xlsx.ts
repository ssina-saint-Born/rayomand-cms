import { buildZip } from "../shop/zip";

// Minimal OOXML (.xlsx) writer mirroring Sentinel's PhpSpreadsheet export:
// right-to-left sheet, Vazirmatn 11, bold/centered header with light-blue
// fill, thin borders, frozen header row and auto-sized columns.

export interface XlsxColumn {
    label: string;
    width?: number;
}

export interface XlsxSheet {
    columns: XlsxColumn[];
    meta: [string, string][];
    rows: (string | number | null)[][];
    ltrColumns?: number[];
}

function esc(v: string): string {
    return String(v)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function colLetter(index: number): string {
    let n = index + 1;
    let s = "";
    while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

function cell(ref: string, value: string | number | null, style: number): string {
    if (value === null || value === undefined || value === "")
        return `<c r="${ref}" s="${style}"/>`;
    if (typeof value === "number")
        return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
    const ncols = sheet.columns.length;
    const ltr = new Set(sheet.ltrColumns || []);

    const widths = sheet.columns.map((c, i) => {
        let w = c.width || Math.max(10, c.label.length + 4);
        for (const row of sheet.rows) {
            const v = row[i];
            const len = v === null || v === undefined ? 0 : String(v).length;
            if (len + 3 > w)
                w = len + 3;
        }
        return Math.min(w, 60);
    });

    const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");

    const rowsXml: string[] = [];
    let r = 1;

    // Metadata block (labels bold, values normal) then a blank row.
    for (const [label, value] of sheet.meta) {
        const cells = [
            cell(`A${r}`, label, 3),
            cell(`B${r}`, value, 4),
        ].join("");
        rowsXml.push(`<row r="${r}" ht="20" customHeight="1">${cells}</row>`);
        r++;
    }
    rowsXml.push(`<row r="${r}"/>`);
    r++;

    // Table header.
    const headerRow = r;
    const headerCells = sheet.columns.map((c, i) => cell(`${colLetter(i)}${r}`, c.label, 1)).join("");
    rowsXml.push(`<row r="${r}" ht="22" customHeight="1">${headerCells}</row>`);
    r++;

    // Data rows.
    for (const row of sheet.rows) {
        const cells = sheet.columns.map((_, i) => {
            const style = ltr.has(i) ? 5 : 2;
            return cell(`${colLetter(i)}${r}`, row[i] ?? null, style);
        }).join("");
        rowsXml.push(`<row r="${r}" ht="22" customHeight="1">${cells}</row>`);
        r++;
    }

    const lastCol = colLetter(Math.max(0, ncols - 1));
    const dim = `A1:${lastCol}${Math.max(1, r - 1)}`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="${dim}"/>
<sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${headerRow + 1}" sqref="A${headerRow + 1}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${rowsXml.join("")}</sheetData>
</worksheet>`;
}

function stylesXml(): string {
    // cellXfs indices: 0 default, 1 header, 2 data RTL, 3 meta label, 4 meta value, 5 data LTR
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3">
<font><sz val="11"/><name val="Vazirmatn"/></font>
<font><b/><sz val="11"/><name val="Vazirmatn"/></font>
<font><sz val="11"/><name val="Vazirmatn"/><color rgb="FF666666"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE7F3FF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD0D7E2"/></left><right style="thin"><color rgb="FFD0D7E2"/></right><top style="thin"><color rgb="FFD0D7E2"/></top><bottom style="thin"><color rgb="FFD0D7E2"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

export function buildXlsx(sheet: XlsxSheet): Buffer {
    const files: { name: string; data: Buffer }[] = [
        {
            name: "[Content_Types].xml",
            data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`, "utf8"),
        },
        {
            name: "_rels/.rels",
            data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`, "utf8"),
        },
        {
            name: "xl/workbook.xml",
            data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Users" sheetId="1" r:id="rId1"/></sheets>
</workbook>`, "utf8"),
        },
        {
            name: "xl/_rels/workbook.xml.rels",
            data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`, "utf8"),
        },
        { name: "xl/styles.xml", data: Buffer.from(stylesXml(), "utf8") },
        { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheetXml(sheet), "utf8") },
    ];
    return buildZip(files);
}
