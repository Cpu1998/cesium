#!/usr/bin/env node
'use strict';

// Tour topology analyzer for the Understand-Anything pipeline.
// Computes fan-in / fan-out rankings, entry-point candidates, a BFS
// dependency traversal, non-code inventory, tightly-coupled clusters,
// layers, and a node summary index from an assembled file-level graph.

const fs = require('fs');

function main() {
  const inPath = process.argv[2];
  const outPath = process.argv[3];
  if (!inPath || !outPath) {
    console.error('usage: ua-tour-analyze.js <input.json> <output.json>');
    process.exit(1);
  }
  const raw = fs.readFileSync(inPath, 'utf8');
  const graph = JSON.parse(raw);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const layers = Array.isArray(graph.layers) ? graph.layers : [];

  const nodeById = new Map();
  for (const n of nodes) nodeById.set(n.id, n);

  // ---------- Fan-in / Fan-out ----------
  const fanIn = new Map();
  const fanOut = new Map();
  for (const n of nodes) { fanIn.set(n.id, 0); fanOut.set(n.id, 0); }
  for (const e of edges) {
    if (fanOut.has(e.source)) fanOut.set(e.source, fanOut.get(e.source) + 1);
    if (fanIn.has(e.target)) fanIn.set(e.target, fanIn.get(e.target) + 1);
  }

  const top = (m, n) => Array.from(m.entries())
    .map(([id, v]) => ({ id, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, n);

  const fanInTop = top(fanIn, 20).map(o => ({
    id: o.id, fanIn: o.v,
    name: (nodeById.get(o.id) || {}).name || o.id,
  }));
  const fanOutTop = top(fanOut, 20).map(o => ({
    id: o.id, fanOut: o.v,
    name: (nodeById.get(o.id) || {}).name || o.id,
  }));

  // Stats for entry-point scoring thresholds.
  const outVals = Array.from(fanOut.values()).sort((a, b) => b - a);
  const inVals = Array.from(fanIn.values()).sort((a, b) => a - b); // ascending for bottom %
  const top10pctOutThreshold = outVals[Math.floor(outVals.length * 0.10)] || 0;
  const bottom25pctInCutoff = inVals[Math.floor(inVals.length * 0.25)] || 0;

  // ---------- Entry point candidates ----------
  const ENTRY_NAMES = new Set([
    'index.ts','index.js','main.ts','main.js','app.ts','app.js',
    'server.ts','server.js','mod.rs','main.go','main.py','main.rs',
    'manage.py','app.py','wsgi.py','asgi.py','run.py','__main__.py',
    'Application.java','Main.java','Program.cs','config.ru','index.php',
    'App.swift','Application.kt','main.cpp','main.c','index.cjs','index.mjs',
    'Cesium.js','server.js',
  ]);

  function depth(filePath) {
    if (!filePath) return 99;
    return filePath.split('/').filter(Boolean).length;
  }

  const entryScores = [];
  for (const n of nodes) {
    let score = 0;
    const fp = n.filePath || '';
    const d = depth(fp);
    if (n.type === 'document') {
      if (n.name === 'README.md' && d <= 1) score += 5;
      else if ((n.name || '').endsWith('.md') && d <= 1) score += 2;
    } else {
      if (ENTRY_NAMES.has(n.name)) score += 3;
      if (d <= 2) score += 1;
      if (fanOut.get(n.id) >= top10pctOutThreshold && top10pctOutThreshold > 0) score += 1;
      if (fanIn.get(n.id) <= bottom25pctInCutoff) score += 1;
    }
    if (score > 0) entryScores.push({ id: n.id, score, name: n.name, type: n.type, summary: n.summary || '' });
  }
  entryScores.sort((a, b) => b.score - a.score);
  const entryCandidates = entryScores.slice(0, 8);

  // ---------- BFS from top code entry point ----------
  // build adjacency over imports + calls + depends_on
  const adj = new Map();
  for (const n of nodes) adj.set(n.id, []);
  const BFS_EDGE_TYPES = new Set(['imports', 'calls', 'depends_on']);
  for (const e of edges) {
    if (!BFS_EDGE_TYPES.has(e.type)) continue;
    if (!adj.has(e.source) || !nodeById.has(e.target)) continue;
    adj.get(e.source).push(e.target);
  }

  const topCodeEntry = entryCandidates.find(c => c.type !== 'document');
  const bfs = {
    startNode: topCodeEntry ? topCodeEntry.id : null,
    order: [],
    depthMap: {},
    byDepth: {},
  };
  if (topCodeEntry) {
    const start = topCodeEntry.id;
    const visited = new Set([start]);
    const queue = [{ id: start, depth: 0 }];
    bfs.depthMap[start] = 0;
    while (queue.length) {
      const { id, depth } = queue.shift();
      bfs.order.push(id);
      if (!bfs.byDepth[depth]) bfs.byDepth[depth] = [];
      bfs.byDepth[depth].push(id);
      for (const nxt of adj.get(id) || []) {
        if (visited.has(nxt)) continue;
        visited.add(nxt);
        bfs.depthMap[nxt] = depth + 1;
        queue.push({ id: nxt, depth: depth + 1 });
      }
    }
  }

  // ---------- Non-code inventory ----------
  const TYPE_CATS = {
    document: 'documentation',
    pipeline: 'infrastructure', service: 'infrastructure', resource: 'infrastructure',
    table: 'data', schema: 'data', endpoint: 'data',
    config: 'config',
  };
  const nonCodeFiles = { documentation: [], infrastructure: [], data: [], config: [] };
  for (const n of nodes) {
    const cat = TYPE_CATS[n.type];
    if (!cat) continue;
    nonCodeFiles[cat].push({
      id: n.id, name: n.name, type: n.type, summary: n.summary || '',
    });
  }

  // ---------- Tightly coupled clusters ----------
  // bidirectional edges (any type, both directions)
  const revCount = new Map(); // target -> count of distinct sources
  const fwdTargets = new Map();
  for (const n of nodes) fwdTargets.set(n.id, new Set());
  for (const e of edges) {
    if (!fwdTargets.has(e.source) || !nodeById.has(e.target)) continue;
    fwdTargets.get(e.source).add(e.target);
  }
  // pair -> bidirectional?
  const pairKey = (a, b) => a < b ? a + '||' + b : b + '||' + a;
  const bidirPairs = [];
  const seenPair = new Set();
  for (const [src, targets] of fwdTargets.entries()) {
    for (const tgt of targets) {
      const back = fwdTargets.get(tgt);
      if (back && back.has(src)) {
        const k = pairKey(src, tgt);
        if (seenPair.has(k)) continue;
        seenPair.add(k);
        bidirPairs.push([src, tgt]);
      }
    }
  }
  // union-find style expansion
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  };
  // count edges between any two nodes (both directions)
  const edgeCountBetween = new Map();
  const ecKey = (a, b) => a < b ? a + '||' + b : b + '||' + a;
  for (const e of edges) {
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) continue;
    const k = ecKey(e.source, e.target);
    edgeCountBetween.set(k, (edgeCountBetween.get(k) || 0) + 1);
  }
  for (const [a, b] of bidirPairs) union(a, b);
  // Also merge pairs that have >=3 edges between them (strong coupling)
  for (const [k, c] of edgeCountBetween.entries()) {
    if (c >= 3) {
      const [a, b] = k.split('||');
      union(a, b);
    }
  }
  const groups = new Map();
  for (const n of nodes) {
    if (!parent.has(n.id)) continue;
    const root = find(n.id);
    if (!groups.has(root)) groups.set(root, new Set());
    groups.get(root).add(n.id);
  }
  // score clusters by total internal edge count
  const clusterList = [];
  for (const [, set] of groups.entries()) {
    if (set.size < 2 || set.size > 6) continue;
    const arr = Array.from(set);
    let internal = 0;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        internal += edgeCountBetween.get(ecKey(arr[i], arr[j])) || 0;
      }
    }
    clusterList.push({ nodes: arr, edgeCount: internal });
  }
  clusterList.sort((a, b) => b.edgeCount - a.edgeCount || b.nodes.length - a.nodes.length);
  const clusters = clusterList.slice(0, 10);

  // ---------- Layers ----------
  const layerOut = {
    count: layers.length,
    list: layers.map(L => ({ id: L.id, name: L.name, description: L.description })),
  };

  // ---------- Node summary index ----------
  const nodeSummaryIndex = {};
  for (const n of nodes) {
    nodeSummaryIndex[n.id] = {
      name: n.name, type: n.type, summary: n.summary || '',
    };
  }

  const result = {
    scriptCompleted: true,
    entryPointCandidates: entryCandidates,
    fanInRanking: fanInTop,
    fanOutRanking: fanOutTop,
    bfsTraversal: bfs,
    nonCodeFiles,
    clusters,
    layers: layerOut,
    nodeSummaryIndex,
    totalNodes: nodes.length,
    totalEdges: edges.length,
  };
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.error('[ua-tour] wrote ' + outPath +
    ' | nodes=' + nodes.length + ' edges=' + edges.length +
    ' | entry=' + (topCodeEntry ? topCodeEntry.id : 'NONE') +
    ' | bfsReached=' + bfs.order.length +
    ' | clusters=' + clusters.length);
}

try { main(); process.exit(0); }
catch (err) { console.error('[ua-tour] FATAL: ' + (err && err.stack ? err.stack : err)); process.exit(1); }
