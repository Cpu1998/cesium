#!/usr/bin/env node
/**
 * study/tools/check-links.mjs — 校验 study/*.md 中的源码跳转链接
 * 用法：在仓库根目录执行 `node study/tools/check-links.mjs`
 * 校验：
 *   1) 指向 Cpu1998/cesium 的 GitHub blob 链接：文件必须存在、行号范围落在文件行数内、
 *      ref 必须是 study/1.145-annotated；
 *   2) Markdown 相对链接：目标文件必须存在。
 * 副产物：study/tools/linked-files.txt（当前所有文档链接到的源码文件冻结清单）。
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const toolsDir = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(toolsDir, "../..");
const studyDir = path.join(root, "study");
const BRANCH = "study/1.145-annotated";
const BLOB_PREFIX = "https://github.com/Cpu1998/cesium/blob/";

let errors = 0;
let warnings = 0;
let codeLinks = 0;
let relLinks = 0;
const problems = [];
const linkedFiles = new Set();
const lineCache = new Map();

function lineCount(rel) {
  if (lineCache.has(rel)) return lineCache.get(rel);
  const abs = path.join(root, rel);
  const n = fs.existsSync(abs)
    ? fs.readFileSync(abs, "utf8").split("\n").length
    : -1;
  lineCache.set(rel, n);
  return n;
}

const mdFiles = fs
  .readdirSync(studyDir)
  .filter((f) => f.endsWith(".md"))
  .sort();

for (const f of mdFiles) {
  const text = fs.readFileSync(path.join(studyDir, f), "utf8");

  // 1) 本仓库 blob 链接（正文任意位置出现的完整 URL）
  const urlRe = /https:\/\/github\.com\/Cpu1998\/cesium\/blob\/[^\s)#<>"',]+/g;
  for (const u of text.matchAll(urlRe)) {
    const raw = u[0];
    const rest = raw.slice(BLOB_PREFIX.length);
    const hashIdx = rest.indexOf("#");
    const noHash = hashIdx === -1 ? rest : rest.slice(0, hashIdx);
    const anchor = hashIdx === -1 ? "" : rest.slice(hashIdx);
    if (!noHash.startsWith(`${BRANCH}/`)) {
      problems.push(`[WARN] ${f}: ref 不是 ${BRANCH} → ${raw}`);
      warnings++;
      continue;
    }
    const filePath = noHash.slice(BRANCH.length + 1);
    codeLinks++;
    linkedFiles.add(filePath);
    const total = lineCount(filePath);
    if (total === -1) {
      problems.push(`[ERR ] ${f}: 链接的文件不存在 → ${raw}`);
      errors++;
      continue;
    }
    if (anchor !== "") {
      const m = anchor.match(/^#L(\d+)(?:-L(\d+))?$/);
      if (!m) {
        problems.push(`[ERR ] ${f}: 锚点格式非法 → ${raw}`);
        errors++;
        continue;
      }
      const s = parseInt(m[1], 10);
      const e = m[2] ? parseInt(m[2], 10) : s;
      if (s < 1 || e < s || e > total) {
        problems.push(`[ERR ] ${f}: 行号越界（文件共 ${total} 行）→ ${raw}`);
        errors++;
      }
    }
  }

  // 2) Markdown 链接里的相对目标
  const mdRe = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const l of text.matchAll(mdRe)) {
    const target = l[1];
    if (/^(https?:|mailto:|data:|#)/.test(target)) continue;
    relLinks++;
    const clean = target.split("#")[0];
    if (clean === "") continue;
    if (!fs.existsSync(path.resolve(studyDir, clean))) {
      problems.push(`[ERR ] ${f}: 相对链接目标不存在 → ${target}`);
      errors++;
    }
  }
}

fs.writeFileSync(
  path.join(toolsDir, "linked-files.txt"),
  ";; 由 check-links.mjs 自动生成：当前文档链接到的源码文件（冻结清单，禁改）\n" +
    [...linkedFiles].sort().join("\n") +
    "\n"
);

console.log(
  `扫描 ${mdFiles.length} 个 md：代码链接 ${codeLinks} 个，相对链接 ${relLinks} 个；错误 ${errors}，警告 ${warnings}`
);
for (const p of problems) console.log(p);
process.exit(errors ? 1 : 0);
