#!/usr/bin/env node
const fs = require('fs');
const INTER = '/home/ubuntu/桌面/project/cesium/.understand-anything/intermediate';

const graph = JSON.parse(fs.readFileSync(`${INTER}/assembled-graph.json`, 'utf8'));
const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
const edges = Array.isArray(graph.edges) ? graph.edges : [];
const nodeIds = new Set(nodes.map(n => n.id));

// --- Normalize layers ---
let layersRaw = JSON.parse(fs.readFileSync(`${INTER}/layers.json`, 'utf8'));
if (!Array.isArray(layersRaw) && Array.isArray(layersRaw.layers)) layersRaw = layersRaw.layers;
const PREFIXES = new Set(['file','config','document','service','pipeline','table','schema','resource','endpoint','function','class','module','concept']);
const layers = layersRaw.map((L, i) => {
  let nodeIdsArr = L.nodeIds || L.nodes || [];
  // if nodes entries are objects with id, extract
  nodeIdsArr = nodeIdsArr.map(n => (typeof n === 'object' && n.id) ? n.id : n);
  // convert bare file paths to file:<path>
  nodeIdsArr = nodeIdsArr.map(id => {
    if (typeof id !== 'string') return null;
    const pre = id.split(':')[0];
    return PREFIXES.has(pre) ? id : `file:${id}`;
  }).filter(Boolean);
  // drop dangling
  nodeIdsArr = nodeIdsArr.filter(id => nodeIds.has(id));
  return {
    id: L.id || `layer:${(L.name||'layer-'+i).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}`,
    name: L.name || 'Unnamed Layer',
    description: L.description || '',
    nodeIds: nodeIdsArr,
  };
});

// --- Normalize tour ---
let tourRaw = JSON.parse(fs.readFileSync(`${INTER}/tour.json`, 'utf8'));
if (!Array.isArray(tourRaw) && Array.isArray(tourRaw.steps)) tourRaw = tourRaw.steps;
const tour = tourRaw.map((step, i) => {
  let ids = step.nodeIds || step.nodesToInspect || [];
  ids = ids.map(id => {
    if (typeof id !== 'string') return null;
    const pre = id.split(':')[0];
    return PREFIXES.has(pre) ? id : `file:${id}`;
  }).filter(Boolean).filter(id => nodeIds.has(id));
  const out = {
    order: typeof step.order === 'number' ? step.order : i + 1,
    title: step.title || 'Untitled Step',
    description: step.description || step.whyItMatters || '',
    nodeIds: ids,
  };
  if (typeof step.languageLesson === 'string') out.languageLesson = step.languageLesson;
  return out;
}).sort((a, b) => a.order - b.order);

// --- Project metadata ---
const project = {
  name: 'cesium',
  languages: ['JavaScript', 'GLSL', 'JSON', 'YAML', 'HTML', 'TypeScript', 'CSS', 'Markdown'],
  frameworks: ['WebGL', 'esbuild', 'gulp', 'Jasmine', 'Karma', 'Playwright', 'ESLint', 'jsdoc', 'Express', 'Husky', 'GitHub Actions'],
  description: 'CesiumJS 是一个用于在 Web 浏览器中（无需插件）创建 3D 地球与 2D 地图的 JavaScript 库。它基于 WebGL 实现硬件加速渲染，针对动态数据可视化进行优化，并构建在 3D Tiles、glTF 等开放格式之上。仓库以 monorepo 形式组织，核心位于 @cesium/engine（Core/Scene/DataSources/Renderer/Shaders/Workers），UI 组件位于 @cesium/widgets，另含 Sandcastle 示例画廊与 Copilot 应用。',
  analyzedAt: new Date().toISOString(),
  gitCommitHash: '135d31863f689633f5026157f915867b6fdaf2ba',
};

const finalGraph = { version: '1.0.0', project, nodes, edges, layers, tour };
fs.writeFileSync(`${INTER}/assembled-graph.json`, JSON.stringify(finalGraph, null, 2));

console.log('Assembled final graph:');
console.log('  nodes:', nodes.length);
console.log('  edges:', edges.length);
console.log('  layers:', layers.length, '(total nodeIds assigned:', layers.reduce((a,l)=>a+l.nodeIds.length,0), ')');
console.log('  tour steps:', tour.length);
const fileLevelTypes = new Set(['file','config','document','service','pipeline','table','schema','resource','endpoint']);
const fileNodes = nodes.filter(n => fileLevelTypes.has(n.type));
const assigned = new Set();
layers.forEach(l => l.nodeIds.forEach(id => assigned.add(id)));
let unassigned = fileNodes.filter(n => !assigned.has(n.id)).length;
let multiAssigned = 0;
const seen = new Set();
layers.forEach(l => l.nodeIds.forEach(id => { if (seen.has(id)) multiAssigned++; seen.add(id); }));
console.log('  file-level nodes:', fileNodes.length, '| unassigned:', unassigned, '| multi-assigned:', multiAssigned);
