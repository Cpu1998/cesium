# study 文档「可点击跳转」规范（2026-11-04 晚间任务）

> 本文件是今晚接力各棒的唯一规范来源，开工前必读。

## 今晚总规则（红线）

1. **只允许修改 `study/*.md` 与 `study/tools/*`**。任何 `.js` / GLSL / JSON / Spec 一律禁改
   ——今晚起源码行号冻结，文档里的行级链接才不会失效。
2. 新文档命名：`NN-中文标题.md`（编号接续现有最大值，如 06、07…）。
3. 所有工作在 worktree `~/.openclaw/workspace/github/cesium-study`、分支 `study/1.145-annotated` 上进行。
4. 开工先 `git pull --rebase origin study/1.145-annotated`；收尾必跑链接校验并 push。
5. 收尾在 `study/PROGRESS.md` 末尾追加本棒记录（做了什么/改了哪些文件/下一棒建议），
   PROGRESS 里写「路径+函数名」即可，不放行级链接。

## 链接规范

### 模板（仓库内相对路径，指向本地源码；2026-11-06 23:06 用户拍板：不再用 GitHub 长链）

- 行级：`../<仓库相对路径>#L123`（从 study/ 出发）
- 区间：`…#L123-L180`
- 文件级（无精确定位时）：`../<路径>`（不带锚点）
- 效果：VS Code 本地点开直接跳到源码对应行；GitHub 网页上也依然可点

### 写法示例

把「文件路径 + 函数名」都做成链接——路径用文件级、符号用行级：

```md
- [`Camera.js`](../packages/engine/Source/Scene/Camera.js)
  的 [`Camera.prototype.flyTo`](../packages/engine/Source/Scene/Camera.js#L1680)
```

表格单元格、列表项同样处理；文档间互引用相对链接（如 `[05-帧更新与渲染循环.md](05-帧更新与渲染循环.md)`）。
ASCII 图与 ``` 代码块内部**不加**链接。

### 行号从哪来（唯一合法来源：本地 grep，禁止凭记忆写）

```bash
cd ~/.openclaw/workspace/github/cesium-study
grep -n "Camera.prototype.flyTo " packages/engine/Source/Scene/Camera.js | head -3
```

- 取**定义行**（`function foo` / `X.prototype.bar =` / `class X` / 导出行），不是调用行。
- 引用整段逻辑给区间锚点 `#L起-L止`；确实找不到精确定位就退文件级链接，宁缺毋滥。
- 路径必须与仓库内真实文件一致（先 `ls`/`find` 确认，不要猜目录；1.145 有子目录重排，如 Scene/Model/）。
- shader 文件后缀是 `.glsl`（import 的 `.js` 名是构建期约定），链接直接指 `.glsl` 真实文件。

## 校验（收尾必跑，全绿才 commit）

```bash
cd ~/.openclaw/workspace/github/cesium-study
node study/tools/check-links.mjs
```

校验内容：所有代码链接的文件存在、行号在文件行数范围内、ref 正确；所有相对链接目标存在。
校验器会重写 `study/tools/linked-files.txt`（一并提交，作为「冻结文件清单」）。

## 新文档风格（对齐现有 00–05）

- 开头三件套：标题 `# NN · …`；`> 阅读前提/一句话简介` 引用块；「本文讲什么 + 对应源码主战场」清单（带链接）。
- 章节 `## n. 标题`；多用 ASCII 图与表格；关键结论加粗；适当「动手实验 / 常见坑」小节。
- 篇幅 250–450 行，宁深勿水；所有源码引用一律带可点击链接。
- 完成后把新篇追加进 `study/README.md` 文档索引表（编号/链接/一句话摘要/源码主战场），
  并在 README「成果统计」处保持数字最新（篇数自行 +1）。

## commit 规范

中文 message，前缀 `docs(study): `，例如 `docs(study): 06-相机系统与视角控制（全文可点击跳转）`。
