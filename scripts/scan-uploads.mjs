import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const CWD = process.cwd();
const OUTPUT_ROOT = path.join(CWD, "intelligence.json");
const OUTPUT_PUBLIC = path.join(CWD, "public", "intelligence.json");
const CANDIDATE_UPLOAD_DIRS = ["/uploads", path.join(CWD, "uploads")];

const SUPPORTED_EXTS = new Set([".txt", ".md", ".json", ".pdf"]);

const partyPattern =
  /\b([A-Z][A-Za-z0-9&.,'’\- ]{2,80}?\s(?:Inc\.?|LLC|L\.L\.C\.|Ltd\.?|LP|L\.P\.|LLP|L\.L\.P\.|Corporation|Corp\.?|Company|Co\.?|PLC|PC|P\.C\.|Association|Bank|Trust|University))\b/g;
const rolePartyPattern =
  /\b(?:plaintiff|defendant|petitioner|respondent|claimant|appellant|appellee)\s*[:\-]\s*([A-Z][A-Za-z0-9&.,'’\- ]{2,80})/gi;
const courtPattern =
  /\b(Supreme Court|Court of Appeals|District Court|United States District Court|U\.S\. District Court|Superior Court|Circuit Court|Court of Chancery|Bankruptcy Court|Appellate Division|High Court|Tribunal)\b/gi;
const datePatternLong =
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{4}\b/gi;
const datePatternShort = /\b\d{1,4}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g;
const isoPattern = /\b\d{4}-\d{1,2}-\d{1,2}\b/g;

const normalize = (value) => value.replace(/\s+/g, " ").trim();

async function existsDir(dir) {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (SUPPORTED_EXTS.has(ext)) files.push(full);
  }
  return files;
}

async function extractPdfLines(filePath) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: await fs.readFile(filePath) });
  const pdf = await loadingTask.promise;
  const lines = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const tc = await page.getTextContent();
    const text = tc.items
      .map((item) => {
        const value = typeof item.str === "string" ? item.str : "";
        const eol = item.hasEOL ? "\n" : " ";
        return `${value}${eol}`;
      })
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
    const pageLines = text.split("\n");
    pageLines.forEach((line, idx) => {
      if (line.trim()) {
        lines.push({ page: pageNum, line: idx + 1, text: normalize(line) });
      }
    });
  }
  return lines;
}

async function extractTextLines(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return extractPdfLines(filePath);
  const raw = await fs.readFile(filePath, "utf8");
  let page = 1;
  const lines = [];
  raw.split("\n").forEach((line, idx) => {
    if (line.includes("\f")) page += 1;
    const cleaned = normalize(line.replace(/\f/g, ""));
    if (!cleaned) return;
    lines.push({ page, line: idx + 1, text: cleaned });
  });
  return lines;
}

function pushUnique(map, key, value) {
  if (!map.has(key)) map.set(key, value);
}

function scanLinesForIntelligence(lines, sourceFile, accum) {
  for (const row of lines) {
    const text = row.text;

    partyPattern.lastIndex = 0;
    rolePartyPattern.lastIndex = 0;
    courtPattern.lastIndex = 0;
    datePatternLong.lastIndex = 0;
    datePatternShort.lastIndex = 0;
    isoPattern.lastIndex = 0;

    let m;
    while ((m = partyPattern.exec(text)) !== null) {
      const name = normalize(m[1]);
      pushUnique(accum.partiesMap, `${name}|${sourceFile}|${row.page}|${row.line}`, {
        name,
        sourceFile,
        page: row.page,
        line: row.line,
      });
    }
    while ((m = rolePartyPattern.exec(text)) !== null) {
      const name = normalize(m[1]);
      pushUnique(accum.partiesMap, `${name}|${sourceFile}|${row.page}|${row.line}`, {
        name,
        sourceFile,
        page: row.page,
        line: row.line,
      });
    }
    while ((m = courtPattern.exec(text)) !== null) {
      const name = normalize(m[1]);
      pushUnique(accum.courtsMap, `${name}|${sourceFile}|${row.page}|${row.line}`, {
        name,
        sourceFile,
        page: row.page,
        line: row.line,
      });
    }
    const dates = [];
    while ((m = datePatternLong.exec(text)) !== null) dates.push(normalize(m[0]));
    while ((m = datePatternShort.exec(text)) !== null) dates.push(normalize(m[0]));
    while ((m = isoPattern.exec(text)) !== null) dates.push(normalize(m[0]));

    for (const dateValue of dates) {
      pushUnique(accum.datesMap, `${dateValue}|${sourceFile}|${row.page}|${row.line}`, {
        date: dateValue,
        sourceFile,
        page: row.page,
        line: row.line,
      });
      pushUnique(accum.timelineMap, `${dateValue}|${sourceFile}|${row.page}|${row.line}`, {
        date: dateValue,
        description: text.slice(0, 240),
        sourceFile,
        page: row.page,
        line: row.line,
      });
    }
  }
}

async function ensureWritable(filePath) {
  try {
    await fs.access(filePath, fs.constants.W_OK);
  } catch {
    try {
      await fs.chmod(filePath, 0o644);
      console.log(`Applied chmod +w to ${filePath}`);
    } catch {
      // ignore if file doesn't exist yet
    }
  }
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await ensureWritable(filePath);
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function main() {
  const existingDirs = [];
  for (const dir of CANDIDATE_UPLOAD_DIRS) {
    if (await existsDir(dir)) existingDirs.push(dir);
  }

  const sourceDir = existingDirs[0] ?? CANDIDATE_UPLOAD_DIRS[1];
  const files = (await existsDir(sourceDir)) ? await walkFiles(sourceDir) : [];

  const accum = {
    partiesMap: new Map(),
    courtsMap: new Map(),
    datesMap: new Map(),
    timelineMap: new Map(),
  };
  const warnings = [];

  if (!(await existsDir(sourceDir))) {
    warnings.push(`Uploads directory not found: ${sourceDir}`);
  }
  if (!files.length) {
    warnings.push("No supported files found for scanning.");
  }

  for (const file of files) {
    try {
      const lines = await extractTextLines(file);
      scanLinesForIntelligence(lines, path.relative(CWD, file), accum);
    } catch (err) {
      warnings.push(`Failed to scan ${path.relative(CWD, file)}: ${String(err)}`);
    }
  }

  const payload = {
    schemaVersion: "1.0",
    scannedAt: new Date().toISOString(),
    sourceDirectory: sourceDir,
    filesScanned: files.map((f) => path.relative(CWD, f)),
    warnings,
    people: Array.from(accum.partiesMap.values()),
    courts: Array.from(accum.courtsMap.values()),
    keyDates: Array.from(accum.datesMap.values()),
    timeline: Array.from(accum.timelineMap.values()),
  };

  await writeJson(OUTPUT_ROOT, payload);
  await writeJson(OUTPUT_PUBLIC, payload);

  console.log(`Wrote ${OUTPUT_ROOT}`);
  console.log(`Wrote ${OUTPUT_PUBLIC}`);
  console.log(
    `Extracted: ${payload.people.length} people, ${payload.courts.length} courts, ${payload.keyDates.length} key dates`,
  );
}

await main();
