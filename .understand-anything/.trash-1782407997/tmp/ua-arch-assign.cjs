#!/usr/bin/env node
/* Assign every file-level node to exactly one CesiumJS architectural layer. */
'use strict';
const fs = require('fs');

const input = JSON.parse(fs.readFileSync('.understand-anything/tmp/ua-arch-input.json', 'utf8'));
const fileNodes = input.fileNodes;

const layers = {
  'layer:core': { name: '核心数学与几何 (Core)', description: 'packages/engine/Source/Core 子系统：数学、几何、地理测量 (geodesy)、数据结构、坐标变换与 I/O，是整个引擎最底层的依赖基石（被 Scene/DataSources/Renderer 大量依赖）。', nodeIds: [] },
  'layer:scene': { name: '场景渲染与图元 (Scene)', description: 'packages/engine/Source/Scene 子系统：3D 场景图、primitives、影像/地形 provider、3D Tiles、glTF 模型、post-process 与 voxel 的高层渲染逻辑。', nodeIds: [] },
  'layer:renderer': { name: 'WebGL 渲染器 (Renderer)', description: 'packages/engine/Source/Renderer 子系统：对 WebGL 的封装层，包括 context、textures、framebuffers、buffers、draw commands 与 shader 编译。', nodeIds: [] },
  'layer:shaders': { name: 'GLSL Shader (Shaders)', description: 'packages/engine/Source/Shaders：内置 GLSL shader 源码，涵盖材质、模型、post-process、voxel 等可编程管线。', nodeIds: [] },
  'layer:workers': { name: 'Web Workers (Workers)', description: 'packages/engine/Source/Workers：在后台线程执行的任务模块（解码、几何生成、地形处理等），通过 transferable 与主线程通信。', nodeIds: [] },
  'layer:datasources': { name: '数据源与实体 (DataSources)', description: 'packages/engine/Source/DataSources：entity/data-source 抽象层，CZML、KML、GeoJSON 等数据格式的加载与可视化驱动。', nodeIds: [] },
  'layer:engine-widget': { name: '引擎入口 Widget (Engine Widget)', description: 'packages/engine/Source/Widget 的 CesiumWidget 入口及 packages/engine 包级配置 (package.json/tsconfig 等)，对外暴露的最简渲染窗口封装。', nodeIds: [] },
  'layer:widgets-ui': { name: 'UI Widgets (Widgets)', description: 'packages/widgets/Source：围绕 Viewer 的 UI 控件 (Animation、Geocoder、Inspectors、BaseLayerPicker、Timeline、ProjectionPicker 等) 及其样式与 Knockout 绑定。', nodeIds: [] },
  'layer:sandcastle': { name: 'Sandcastle 示例与 Copilot 应用 (Sandcastle)', description: 'packages/sandcastle：交互式示例画廊 (gallery) 与基于 React/Vite/TypeScript 的 AI Copilot 编辑器应用及其配置。', nodeIds: [] },
  'layer:apps': { name: '示例应用与样本数据 (Apps)', description: 'Apps/ 下的最小示例 (HelloWorld)、CesiumViewer 应用及 Apps/SampleData 中随应用分发的样本数据资源。', nodeIds: [] },
  'layer:specs': { name: '测试套件 (Specs)', description: '基于 Jasmine/Karma 的测试代码：packages/engine/Specs、packages/widgets/Specs 及顶层 Specs/ 下的 spec、test helper、harness 与 karma 配置（不含 Specs/Data 测试夹具数据）。', nodeIds: [] },
  'layer:test-data': { name: '测试夹具数据 (Test Data)', description: 'Specs/Data/ 下的 3D Tiles、glTF、terrain、KML、imagery 等测试夹具资源（含被分类为 schema 的 glTF/gltf 文件），以及独立的 schema/table 数据资产。', nodeIds: [] },
  'layer:build-tooling': { name: '构建与工具链 (Build Tooling)', description: 'Tools/（ast-grep 规则、jsdoc 模板等）、scripts/ 构建脚本、根目录 gulpfile.* 与 server.js 等本地构建/打包/服务工具。', nodeIds: [] },
  'layer:ci-cd': { name: 'CI/CD 与 GitHub 自动化 (.github)', description: '.github/ 下的 GitHub Actions workflows、自定义 actions（CLA 校验、ion token 更新、verify-package）、issue 模板与 dependabot 配置。', nodeIds: [] },
  'layer:documentation': { name: '文档 (Documentation)', description: 'Documentation/ 贡献者/用户文档目录及根目录的 README、CHANGES、CONTRIBUTING、LICENSE 等项目级 markdown 文档。', nodeIds: [] },
  'layer:config': { name: '项目配置 (Config)', description: '根目录及包级的配置文件：package.json、tsconfig、eslint、markdownlint、prettier、Husky/lint-staged、IDE 设置与各类 ignore 文件。', nodeIds: [] },
};

function startsWith(p, prefix) { return p === prefix || p.startsWith(prefix + '/') || p.startsWith(prefix); }

function assign(n) {
  const p = n.filePath;
  const t = n.type;

  // ---- Documentation nodes (document type) ----
  if (t === 'document') {
    if (startsWith(p, 'Documentation/')) return 'layer:documentation';
    // packages-level docs (e.g. packages/engine/README.md) → keep with that package's layer
    if (p === 'packages/engine/README.md' || p === 'packages/engine/LICENSE.md') return 'layer:engine-widget';
    if (p === 'packages/widgets/README.md' || p === 'packages/widgets/LICENSE.md' || p === 'packages/widgets/CHANGES.md') return 'layer:widgets-ui';
    if (p === 'packages/sandcastle/README.md' || p === 'packages/sandcastle/LICENSE.md') return 'layer:sandcastle';
    if (startsWith(p, '.github/')) return 'layer:ci-cd';
    // root-level docs and everything else document-typed
    return 'layer:documentation';
  }

  // ---- Schema / table data assets ----
  if (t === 'schema' || t === 'table') {
    // glTF / 3D Tiles test fixtures live under Specs/Data
    if (startsWith(p, 'Specs/Data/')) return 'layer:test-data';
    if (startsWith(p, 'Apps/')) return 'layer:apps';
    if (startsWith(p, 'packages/sandcastle/')) return 'layer:sandcastle';
    if (startsWith(p, 'Documentation/')) return 'layer:documentation';
    // Documentation/Schemas/* fabric/material schema JSONs
    if (startsWith(p, 'Documentation/Schemas/')) return 'layer:documentation';
    // other top-level schemas (e.g. eslint config schemas) → config
    return 'layer:config';
  }

  // ---- Pipeline (CI workflows) ----
  if (t === 'pipeline') return 'layer:ci-cd';

  // ---- Config nodes ----
  if (t === 'config') {
    if (startsWith(p, '.github/')) return 'layer:ci-cd';
    if (startsWith(p, 'Tools/')) return 'layer:build-tooling';
    if (startsWith(p, 'scripts/')) return 'layer:build-tooling';
    // Configs that live WITHIN a content directory follow that directory's layer
    if (startsWith(p, 'Specs/Data/')) return 'layer:test-data';
    if (startsWith(p, 'Specs/') || startsWith(p, 'packages/engine/Specs/') || startsWith(p, 'packages/widgets/Specs/')) return 'layer:specs';
    if (startsWith(p, 'Apps/')) return 'layer:apps';
    if (startsWith(p, 'Documentation/')) return 'layer:documentation';
    if (startsWith(p, 'packages/engine/')) return 'layer:engine-widget';
    if (startsWith(p, 'packages/widgets/')) return 'layer:widgets-ui';
    if (startsWith(p, 'packages/sandcastle/')) return 'layer:sandcastle';
    // root-level and IDE/Husky/launches configs
    return 'layer:config';
  }

  // ---- file-type nodes: route by path ----
  // .github (actions, workflows beyond pipeline type, issue templates)
  if (startsWith(p, '.github/')) return 'layer:ci-cd';

  // Specs — test code (NOT Specs/Data fixtures). Checked BEFORE package catch-alls.
  if (startsWith(p, 'packages/engine/Specs/')) {
    if (startsWith(p, 'packages/engine/Specs/Data/')) return 'layer:test-data';
    return 'layer:specs';
  }
  if (startsWith(p, 'packages/widgets/Specs/')) {
    if (startsWith(p, 'packages/widgets/Specs/Data/')) return 'layer:test-data';
    return 'layer:specs';
  }
  if (startsWith(p, 'Specs/')) {
    if (startsWith(p, 'Specs/Data/')) return 'layer:test-data';
    return 'layer:specs';
  }

  // Engine subsystems (order matters: Widget before generic Source)
  if (startsWith(p, 'packages/engine/Source/Core/')) return 'layer:core';
  if (startsWith(p, 'packages/engine/Source/Scene/')) return 'layer:scene';
  if (startsWith(p, 'packages/engine/Source/Renderer/')) return 'layer:renderer';
  if (startsWith(p, 'packages/engine/Source/Shaders/')) return 'layer:shaders';
  if (startsWith(p, 'packages/engine/Source/Workers/')) return 'layer:workers';
  if (startsWith(p, 'packages/engine/Source/DataSources/')) return 'layer:datasources';
  if (startsWith(p, 'packages/engine/Source/Widget/')) return 'layer:engine-widget';
  // Any other packages/engine/Source/* → scene (catch-all for engine rendering bits)
  if (startsWith(p, 'packages/engine/Source/')) return 'layer:scene';
  // packages/engine root files (lint-staged.config.js, package.json, README, etc.)
  if (startsWith(p, 'packages/engine/')) return 'layer:engine-widget';

  // Widgets UI (Specs already handled above)
  if (startsWith(p, 'packages/widgets/')) return 'layer:widgets-ui';

  // Sandcastle
  if (startsWith(p, 'packages/sandcastle/')) return 'layer:sandcastle';

  // Apps (including SampleData)
  if (startsWith(p, 'Apps/')) return 'layer:apps';

  // Build tooling
  if (startsWith(p, 'Tools/')) return 'layer:build-tooling';
  if (startsWith(p, 'scripts/')) return 'layer:build-tooling';
  if (p === 'gulpfile.js' || p === 'gulpfile.apps.js' || p === 'gulpfile.makezip.js' || p === 'server.js') return 'layer:build-tooling';

  // Config-ish root files
  if (p === 'Source/copyrightHeader.js') return 'layer:build-tooling';
  if (startsWith(p, '.settings/') || startsWith(p, '.husky/') || startsWith(p, '.externalToolBuilders/') || startsWith(p, 'launches/')) return 'layer:config';

  // remaining root-level files: index.html / index.cjs (entry), ignore files, IDE files → config/build
  if (p === 'index.html' || p === 'index.release.html' || p === 'index.cjs') return 'layer:build-tooling';
  // ignore / attribute / prettier / npm / project files
  if (p.startsWith('.')) return 'layer:config';

  // Generated/understand-anything artifacts should not normally be present, but if any remain → config
  if (startsWith(p, '.understand-anything/')) return 'layer:config';

  // Fallback: anything unrecognized → config
  return 'layer:config';
}

const assignments = {};
let unassigned = [];
for (const n of fileNodes) {
  const layer = assign(n);
  if (!layers[layer]) {
    unassigned.push(n.id);
    continue;
  }
  layers[layer].nodeIds.push(n.id);
  assignments[n.id] = layer;
}

// Validate: every node assigned exactly once
const total = fileNodes.length;
const assigned = Object.values(layers).reduce((s, l) => s + l.nodeIds.length, 0);
console.log('Total file nodes:', total);
console.log('Assigned:', assigned);
console.log('Unassigned:', unassigned.length);
if (unassigned.length) console.log('Unassigned sample:', unassigned.slice(0, 20));

// Check for duplicates
const allAssigned = [].concat(...Object.values(layers).map(l => l.nodeIds));
const dupCheck = new Set();
let dupCount = 0;
for (const id of allAssigned) {
  if (dupCheck.has(id)) { dupCount++; console.log('DUP:', id); }
  dupCheck.add(id);
}
console.log('Duplicates:', dupCount);

// Per-layer counts
console.log('\n=== Per-layer counts ===');
for (const [id, l] of Object.entries(layers)) {
  console.log(l.nodeIds.length.toString().padStart(5), id, '-', l.name);
}

// Remove empty layers
const finalLayers = Object.entries(layers).filter(([, l]) => l.nodeIds.length > 0).map(([id, l]) => ({ id, ...l }));

fs.writeFileSync('.understand-anything/intermediate/layers.json', JSON.stringify(finalLayers, null, 2));
console.log('\nWrote layers.json with', finalLayers.length, 'layers');
