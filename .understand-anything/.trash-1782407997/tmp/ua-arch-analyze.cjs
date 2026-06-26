#!/usr/bin/env node
/* Architecture structural analysis script for CesiumJS */
'use strict';
const fs = require('fs');

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    console.error('Usage: node ua-arch-analyze.js <input.json> <output.json>');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const fileNodes = data.fileNodes || [];
  const importEdges = data.importEdges || [];
  const allEdges = data.allEdges || [];

  const nodeById = new Map();
  for (const n of fileNodes) nodeById.set(n.id, n);

  // ===== A. Directory grouping (compute common prefix, then group by segment(s)) =====
  // For CesiumJS, files mostly share "packages/" prefix. Use a 2-segment grouping to surface engine subsystems.
  const paths = fileNodes.map(n => n.filePath);
  // Compute common path prefix (directory-level)
  function commonDirPrefix(paths) {
    if (paths.length === 0) return '';
    const splitPaths = paths.map(p => p.split('/'));
    let prefix = [];
    const first = splitPaths[0];
    for (let i = 0; i < first.length - 1; i++) {
      const seg = first[i];
      if (splitPaths.every(sp => sp.length > i + 1 && sp[i] === seg)) {
        prefix.push(seg);
      } else break;
    }
    return prefix.length ? prefix.join('/') + '/' : '';
  }
  const prefix = commonDirPrefix(paths);

  // For this project we use a tailored grouping: after stripping common prefix, take first 2 segments
  // but collapse cases where first segment alone is informative.
  function groupForPath(p) {
    let rest = prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p;
    const parts = rest.split('/');
    if (parts.length === 1) {
      // root-level file
      return '__root__';
    }
    // Use 2-level grouping for packages/engine/Source/* to expose subsystems
    // Detect "packages/<pkg>/Source/<sub>" pattern
    const m = rest.match(/^packages\/([^/]+)\/Source\/([^/]+)/);
    if (m) {
      return `packages/${m[1]}/Source/${m[2]}`;
    }
    // Specs location: packages/engine/Specs/<sub>
    const ms = rest.match(/^packages\/([^/]+)\/Specs\/?([^/]*)/);
    if (ms) {
      return ms[2] ? `packages/${ms[1]}/Specs/${ms[2]}` : `packages/${ms[1]}/Specs`;
    }
    // packages/<pkg>/...
    const mp = rest.match(/^packages\/([^/]+)\//);
    if (mp) {
      return `packages/${mp[1]}`;
    }
    // Apps/...
    const ma = rest.match(/^Apps\/([^/]+)/);
    if (ma) return `Apps/${ma[1]}`;
    // Documentation/...
    if (/^Documentation\//.test(rest)) return 'Documentation';
    // top-level dirs
    return parts[0];
  }

  const directoryGroups = {};
  const nodeToGroup = new Map();
  for (const n of fileNodes) {
    const g = groupForPath(n.filePath);
    if (!directoryGroups[g]) directoryGroups[g] = [];
    directoryGroups[g].push(n.id);
    nodeToGroup.set(n.id, g);
  }

  // ===== B. Node type grouping =====
  const nodeTypeGroups = {};
  for (const n of fileNodes) {
    if (!nodeTypeGroups[n.type]) nodeTypeGroups[n.type] = [];
    nodeTypeGroups[n.type].push(n.id);
  }

  // ===== C. Import adjacency (fan-in / fan-out) =====
  const fanOut = {};
  const fanIn = {};
  for (const n of fileNodes) { fanOut[n.id] = 0; fanIn[n.id] = 0; }
  for (const e of importEdges) {
    if (fanOut[e.source] !== undefined) fanOut[e.source]++;
    if (fanIn[e.target] !== undefined) fanIn[e.target]++;
  }

  // ===== D. Cross-category dependency analysis =====
  const crossCategoryMap = {};
  for (const e of allEdges) {
    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    if (!s || !t) continue;
    const key = `${s.type}->${t.type}:${e.type}`;
    crossCategoryMap[key] = (crossCategoryMap[key] || 0) + 1;
  }
  const crossCategoryEdges = Object.entries(crossCategoryMap).map(([k, count]) => {
    const [fromType, rest] = k.split('->');
    const [toType, edgeType] = rest.split(':');
    return { fromType, toType, edgeType, count };
  }).sort((a, b) => b.count - a.count);

  // ===== E. Inter-group import frequency =====
  const interGroupMap = {};
  for (const e of importEdges) {
    const sg = nodeToGroup.get(e.source);
    const tg = nodeToGroup.get(e.target);
    if (!sg || !tg || sg === tg) continue;
    const key = `${sg}|||${tg}`;
    interGroupMap[key] = (interGroupMap[key] || 0) + 1;
  }
  const interGroupImports = Object.entries(interGroupMap).map(([k, count]) => {
    const [from, to] = k.split('|||');
    return { from, to, count };
  }).sort((a, b) => b.count - a.count);

  // ===== F. Intra-group import density =====
  const intraGroupDensity = {};
  const groupEdgeTotals = {};
  for (const e of importEdges) {
    const sg = nodeToGroup.get(e.source);
    const tg = nodeToGroup.get(e.target);
    if (sg) groupEdgeTotals[sg] = (groupEdgeTotals[sg] || 0) + 1;
    if (tg && tg !== sg) groupEdgeTotals[tg] = (groupEdgeTotals[tg] || 0) + 1;
    if (sg && sg === tg) {
      if (!intraGroupDensity[sg]) intraGroupDensity[sg] = { internalEdges: 0, totalEdges: 0, density: 0 };
      intraGroupDensity[sg].internalEdges++;
    }
  }
  for (const g of Object.keys(directoryGroups)) {
    const internal = intraGroupDensity[g] ? intraGroupDensity[g].internalEdges : 0;
    const total = groupEdgeTotals[g] || 0;
    intraGroupDensity[g] = {
      internalEdges: internal,
      totalEdges: total,
      density: total > 0 ? +(internal / total).toFixed(3) : 0
    };
  }

  // ===== G. Directory pattern matching =====
  const dirPatterns = [
    [/routes|api|controllers|endpoints|handlers/i, 'api'],
    [/services|core|lib|domain|logic/i, 'service'],
    [/models|db|data|persistence|repository|entities/i, 'data'],
    [/components|views|pages|ui|layouts|screens/i, 'ui'],
    [/middleware|plugins|interceptors|guards/i, 'middleware'],
    [/utils|helpers|common|shared|tools/i, 'utility'],
    [/config|constants|env|settings/i, 'config'],
    [/__tests__|test|tests|spec|specs/i, 'test'],
    [/types|interfaces|schemas|contracts|dtos/i, 'types'],
    [/shaders|shader/i, 'shader'],
    [/workers/i, 'worker'],
    [/renderer/i, 'renderer'],
    [/widget|widgets/i, 'widget'],
    [/sandcastle/i, 'sandcastle'],
    [/documentation|docs/i, 'documentation'],
    [/deploy|infra|infrastructure/i, 'infrastructure'],
    [/\.github|gitlab|circleci|ci/i, 'ci-cd'],
    [/k8s|kubernetes|helm|charts/i, 'infrastructure'],
    [/terraform/i, 'infrastructure'],
    [/docker/i, 'infrastructure'],
    [/sql|database/i, 'data'],
    [/migrations/i, 'data'],
    [/assets|static|public/i, 'assets'],
    [/scripts/i, 'tooling'],
    [/apps|Apps/i, 'apps'],
    [/bin/i, 'entry'],
    [/entry/i, 'entry'],
  ];
  const patternMatches = {};
  for (const g of Object.keys(directoryGroups)) {
    let label = 'other';
    for (const [re, lab] of dirPatterns) {
      if (re.test(g)) { label = lab; break; }
    }
    patternMatches[g] = label;
  }

  // ===== H. Deployment topology =====
  const infraFiles = [];
  let hasDockerfile = false, hasCompose = false, hasK8s = false, hasTerraform = false, hasCI = false;
  for (const n of fileNodes) {
    const p = n.filePath;
    if (/Dockerfile/i.test(p) || /docker-compose/i.test(p)) {
      hasDockerfile = hasDockerfile || /Dockerfile/i.test(p);
      hasCompose = hasCompose || /docker-compose/i.test(p);
      infraFiles.push(p);
    }
    if (/\.tf$/i.test(p) || /\.tfvars$/i.test(p)) { hasTerraform = true; infraFiles.push(p); }
    if (/k8s|kubernetes/i.test(p) && /\.(ya?ml|json)$/i.test(p)) { hasK8s = true; infraFiles.push(p); }
    if (/\.github\/workflows\//.test(p) || /\.gitlab-ci/i.test(p) || /Jenkinsfile/i.test(p)) { hasCI = true; infraFiles.push(p); }
  }
  const deploymentTopology = {
    hasDockerfile, hasCompose, hasK8s, hasTerraform, hasCI,
    infraFiles: [...new Set(infraFiles)]
  };

  // ===== I. Data pipeline detection =====
  const schemaFiles = [];
  const migrationFiles = [];
  const dataModelFiles = [];
  const apiHandlerFiles = [];
  for (const n of fileNodes) {
    const p = n.filePath;
    if (/\.sql$/i.test(p)) {
      if (/migrat/i.test(p)) migrationFiles.push(p);
      else schemaFiles.push(p);
    }
    if (/\.graphql$|\.gql$|\.proto$|\.prisma$/i.test(p)) schemaFiles.push(p);
    if (/models\//i.test(p) || /\/models\//i.test(p)) dataModelFiles.push(p);
    if (/routes\//i.test(p) || /controllers\//i.test(p) || /endpoints\//i.test(p)) apiHandlerFiles.push(p);
  }
  const dataPipeline = { schemaFiles, migrationFiles, dataModelFiles, apiHandlerFiles };

  // ===== J. Documentation coverage =====
  const groupsWithDocs = new Set();
  for (const n of fileNodes) {
    if (n.type === 'document' || /\.(md|rst)$/i.test(n.filePath)) {
      const g = nodeToGroup.get(n.id);
      if (g) groupsWithDocs.add(g);
    }
  }
  const totalGroups = Object.keys(directoryGroups).length;
  const docCoverage = {
    groupsWithDocs: groupsWithDocs.size,
    totalGroups,
    coverageRatio: totalGroups ? +(groupsWithDocs.size / totalGroups).toFixed(3) : 0,
    undocumentedGroups: Object.keys(directoryGroups).filter(g => !groupsWithDocs.has(g))
  };

  // ===== K. Dependency direction =====
  const pairDir = {}; // "A|B" -> net direction
  for (const e of importEdges) {
    const sg = nodeToGroup.get(e.source);
    const tg = nodeToGroup.get(e.target);
    if (!sg || !tg || sg === tg) continue;
    const key = sg < tg ? `${sg}|${tg}` : `${tg}|${sg}`;
    const sign = sg < tg ? 1 : -1; // count source->target
    pairDir[key] = (pairDir[key] || 0) + sign;
  }
  const dependencyDirection = [];
  for (const [k, net] of Object.entries(pairDir)) {
    const [a, b] = k.split('|');
    if (net > 0) dependencyDirection.push({ dependent: a, dependsOn: b, strength: net });
    else if (net < 0) dependencyDirection.push({ dependent: b, dependsOn: a, strength: -net });
  }
  dependencyDirection.sort((a, b) => b.strength - a.strength);

  // ===== File stats =====
  const filesPerGroup = {};
  for (const g of Object.keys(directoryGroups)) filesPerGroup[g] = directoryGroups[g].length;
  const nodeTypeCounts = {};
  for (const t of Object.keys(nodeTypeGroups)) nodeTypeCounts[t] = nodeTypeGroups[t].length;
  const fileStats = {
    totalFileNodes: fileNodes.length,
    filesPerGroup,
    nodeTypeCounts
  };

  // Top fan-in / fan-out (top 30 each)
  const fileFanIn = Object.entries(fanIn).sort((a, b) => b[1] - a[1]).slice(0, 30)
    .reduce((o, [k, v]) => (o[k] = v, o), {});
  const fileFanOut = Object.entries(fanOut).sort((a, b) => b[1] - a[1]).slice(0, 30)
    .reduce((o, [k, v]) => (o[k] = v, o), {});

  const result = {
    scriptCompleted: true,
    commonPrefix: prefix,
    directoryGroups,
    nodeTypeGroups,
    crossCategoryEdges: crossCategoryEdges.slice(0, 50),
    interGroupImports: interGroupImports.slice(0, 100),
    intraGroupDensity,
    patternMatches,
    deploymentTopology,
    dataPipeline,
    docCoverage,
    dependencyDirection: dependencyDirection.slice(0, 100),
    fileStats,
    fileFanIn,
    fileFanOut
  };
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log('OK: wrote', outputPath);
  console.log('Total file nodes:', fileStats.totalFileNodes);
  console.log('Directory groups:', totalGroups);
}

try { main(); } catch (e) { console.error('FATAL:', e.stack); process.exit(1); }
