#!/usr/bin/env node
/**
 * study/tools/check-links.mjs — 校验 study/*.md 中的源码跳转链接（v2 本地相对路径版）
 * 用法：在仓库根目录执行 `node study/tools/check-links.mjs`
 * 校验：
 *   1) 代码链接：study/*.md 里指向仓库源码的相对路径（../packages/... 或其他 ../ 路径）：
 *      目标必须存在；带 #L 锚点时行号范围必须落在文件行数内；
 *   2) 文档间相对链接（study/ 内 *.md）：目标必须存在；
 *   3) 禁止 Cpu1998/cesium 的 GitHub blob/tree 长链（已全面本地化，发现即错）。
 * 副产物：study/tools/linked-files.txt（当前所有文档链接到的源码文件冻结清单）。
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const toolsDir = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(toolsDir, "../..");
const studyDir = path.join(root, "study");

let errors = 0;
let warnings = 0;
let codeLinks = 0;
let relLinks = 0;
const problems = [];
const linkedFiles = new Set();
const lineCache = new Map();

function lineCount(abs) {
  if (lineCache.has(abs)) return lineCache.get(abs);
  const n = fs.existsSync(abs)
    ? fs.readFileSync(abs, "utf8").split("\n").length
    : -1;
  lineCache.set(abs, n);
  return n;
}

const mdFiles = fs
  .readdirSync(studyDir)
  .filter((f) => f.endsWith(".md"))
  .sort();

for (const f of mdFiles) {
  const text = fs.readFileSync(path.join(studyDir, f), "utf8");

  // 1) 禁止的 GitHub 长链（本 fork）
  const legacyRe = /https:\/\/github\.com\/Cpu1998\/cesium\/(blob|tree)\/[^\s)#<>"']+/g;
  for (const u of text.matchAll(legacyRe)) {
    problems.push(`[ERR ] ${f}: 禁止 GitHub 长链（应转相对路径） → ${u[0]}`);
    errors++;
  }

  // 2) Markdown 相对链接
  const mdRe = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const l of text.matchAll(mdRe)) {
    const target = l[1];
    if (/^(https?:|mailto:|data:|file:|#)/.test(target)) continue;
    const hashIdx = target.indexOf("#");
    const clean = hashIdx === -1 ? target : target.slice(0, hashIdx);
    const anchor = hashIdx === -1 ? "" : target.slice(hashIdx);
    if (clean === "") continue;
    const abs = path.resolve(studyDir, clean);
    if (!fs.existsSync(abs)) {
      problems.push(`[ERR ] ${f}: 相对链接目标不存在 → ${target}`);
      errors++;
      continue;
    }
    const isMd = clean.endsWith(".md");
    if (isMd) {
      relLinks++;
      if (anchor !== "") {
      }
      continue;
    }
    // 代码/资源链接
    codeLinks++;
    linkedFiles.add(path.relative(root, abs));
    if (fs.statSync(abs).isDirectory()) continue; // 目录链接不校验锚点
    if (anchor !== "") {
      const m = anchor.match(/^#L(\d+)(?:-L(\d+))?$/);
      if (!m) {
        problems.push(`[ERR ] ${f}: 锚点格式非法（应为 #L123 或 #L123-L180） → ${target}`);
        errors++;
        continue;
      }
      const total = lineCount(abs);
      const s = parseInt(m[1], 10);
      const e = m[2] ? parseInt(m[2], 10) : s;
      if (s < 1 || e < s || e > total) {
        problems.push(`[ERR ] ${f}: 行号越界（文件共 ${total} 行） → ${target}`);
        errors++;
      }
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
  `扫描 ${mdFiles.length} 个 md：代码链接 ${codeLinks} 个，文档间相对链接 ${relLinks} 个；错误 ${errors}，警告 ${warnings}`
);
for (const p of problems) console.log(p);
process.exit(errors ? 1 : 0);
