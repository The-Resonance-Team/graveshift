const fs = require('node:fs');
const path = require('node:path');

const run = __dirname;
const skill = '/Users/xirothedev/.agents/skills/security-audit';
const coverage = require(path.join(skill, 'validate-coverage-ledger.cjs'));
const schema = fs.readFileSync(path.join(skill, 'report-schema.json'), 'utf8');
const sections = new Map();

function blocks(file) {
  if (sections.has(file)) return sections.get(file);
  const text = fs.readFileSync(path.join(skill, file), 'utf8');
  const lines = text.split('\n');
  const found = new Map();
  const headings = [];
  for (let index = 0; index < lines.length; index++) {
    const heading = lines[index].match(/^## (.+?)(?: \(.+)?$/);
    const bold = lines[index].match(/^\*\*(.+?)\*\*(?: \(.+)?$/);
    if (heading || bold) headings.push({ name: (heading ?? bold)[1], index, kind: heading ? 'heading' : 'class' });
  }
  for (let index = 0; index < headings.length; index++) {
    const item = headings[index];
    const end = headings[index + 1]?.index ?? lines.length;
    found.set(item.name, lines.slice(item.index, end).join('\n').trim());
  }
  sections.set(file, found);
  return found;
}

function blockText(ref) {
  const split = ref.indexOf('#');
  const file = ref.slice(0, split);
  const name = ref.slice(split + 1);
  const result = blocks(file).get(name);
  if (!result) throw new Error(`Missing exact skill block ${ref}`);
  return `${ref}\n\n${result}`;
}

function readJson(name) { return JSON.parse(fs.readFileSync(path.join(run, name), 'utf8')); }
function writeJson(name, value) { fs.writeFileSync(path.join(run, name), `${JSON.stringify(value, null, 2)}\n`); }

function saveLedger(ledger) {
  ledger.sort((a, b) => a.coverage_id < b.coverage_id ? -1 : a.coverage_id > b.coverage_id ? 1 : 0);
  const errors = coverage.validateDocument(ledger);
  if (errors.length) throw new Error(errors.join('\n'));
  writeJson('coverage-ledger.json', ledger);
}

function seed(groups, options = {}) {
  const units = [];
  for (const group of groups) {
    for (const task of group.tasks) {
      const ordinaryRef = task.ordinary ? `ATTACK-CLASSES.md#${task.ordinary}` : null;
      const classRef = task.companion ? `${task.companion[0]}#${task.companion[1]}` : ordinaryRef;
      const refs = { surface: task.surfaceRef ?? group.surfaceRef, boundary: task.boundaryRef ?? group.boundaryRef, subsystem: group.subsystem, attack_class: classRef };
      const companions = task.companion ? ['Core discipline', task.companion[1], 'Universal moves', 'Validation rules'].map(name => `${task.companion[0]}#${name}`) : [];
      for (const ref of [...(ordinaryRef ? [ordinaryRef] : []), ...companions]) blockText(ref);
      const excluded = [
        { block: 'WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding', reason: 'No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points.' },
        { block: 'CLIENT-SIDE.md#DOM-based XSS', reason: 'The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer.' },
      ];
      const alternatives = [...new Set(group.tasks.map(item => item.ordinary).filter(name => name && name !== task.ordinary))];
      if (alternatives.length) excluded.push({ block: `ATTACK-CLASSES.md#${alternatives[0]}`, reason: `This distinct ordinary class has a sibling unit in ${group.subsystem}; this unit covers ${task.label}.` });
      if (group.id === 'model') excluded.push({ block: 'AI-AND-LLM.md#Persistent memory poisoning', reason: 'Gateway, diagnoser and routing modules consume per-task evidence; no independent persistent agent-memory writer/retrieval store is configured.' });
      if (group.id === 'supply-deploy') excluded.push({ block: 'SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion', reason: 'No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff.' });
      units.push({
        coverage_id: coverage.canonicalCoverageId(refs), canonical_refs: refs,
        surface: task.surface ?? group.surface, boundary: task.boundary ?? group.boundary,
        subsystem: group.subsystem, attack_class: task.label,
        starting_paths: task.paths ?? group.paths,
        ordinary_attack_class_block: ordinaryRef,
        selected_companion_blocks: companions,
        excluded_blocks: excluded,
        prior_status: 'none', attempts: [], wave: options.wave ?? 1, status: 'planned', agent_id: null,
        reviewed_paths: [], local_checks: [], result_fingerprints: [], unresolved: [],
        assignment_group: group.id,
        priority: group.priority,
        priority_reason: group.priorityReason,
      });
    }
  }
  if (options.append) saveLedger([...readJson('coverage-ledger.json'), ...units]);
  else {
    const existingFile = path.join(run, 'coverage-ledger.json');
    if (fs.existsSync(existingFile) && readJson('coverage-ledger.json').some(unit => unit.status !== 'planned')) throw new Error('Refusing to replace an evidence-bearing or assigned ledger');
    saveLedger(units);
  }
  return units;
}

function fence(file, title) {
  const text = fs.readFileSync(path.join(skill, file), 'utf8');
  const start = text.indexOf(title);
  const open = text.indexOf('```', start);
  const newline = text.indexOf('\n', open);
  const close = text.indexOf('```', newline);
  if (start < 0 || open < 0 || close < 0) throw new Error(`Missing fenced block ${file} ${title}`);
  return text.slice(newline + 1, close).trim();
}

function assign(groupId) {
  const ledger = readJson('coverage-ledger.json');
  const agentId = `hunt-${groupId}`;
  const units = ledger.filter(unit => unit.assignment_group === groupId && unit.status === 'planned');
  if (!units.length) throw new Error(`No planned units for ${groupId}`);
  for (const unit of units) { unit.status = 'in_progress'; unit.agent_id = agentId; }
  saveLedger(ledger);
  const root = path.join(run, 'agents', agentId);
  fs.mkdirSync(path.join(root, 'scratch'), { recursive: true });
  fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
  const refs = [...new Set(units.flatMap(unit => [...(unit.ordinary_attack_class_block ? [unit.ordinary_attack_class_block] : []), ...unit.selected_companion_blocks]))];
  const excluded = new Map();
  for (const unit of units) for (const item of unit.excluded_blocks) if (!refs.includes(item.block)) excluded.set(item.block, item.reason);
  const prompt = [
    'Your goal is to find source-grounded security invariant failures in the assigned coverage units below. Return exactly one JSON object matching the structured-result contract at the end of this prompt.',
    fs.readFileSync(path.join(run, 'architecture.md'), 'utf8'),
    `Target: /Users/xirothedev/workspace/graveshift\nAgent ID: ${agentId}\nAssigned coverage units and exact block maps:\n${JSON.stringify(units.map(unit => ({ coverage_id: unit.coverage_id, surface: unit.surface, subsystem: unit.subsystem, boundary: unit.boundary, attack_class: unit.attack_class, starting_paths: unit.starting_paths, ordinary_attack_class_block: unit.ordinary_attack_class_block, selected_companion_blocks: unit.selected_companion_blocks, excluded_blocks: unit.excluded_blocks })), null, 2)}`,
    ...refs.map(blockText),
    `Explicit excluded blocks for this assignment:\n${JSON.stringify([...excluded].map(([block, reason]) => ({block, reason})), null, 2)}`,
    fence('HUNTING.md', 'Core hunting method'),
    fence('HUNTING.md', 'Promotion procedure —'),
    fence('HUNTING.md', 'Core validation rules'),
    `Prior confirmed exclusions: none. Peer-owned current IDs you must not duplicate:\n${JSON.stringify(ledger.filter(unit => unit.assignment_group !== groupId).map(unit => unit.coverage_id), null, 2)}`,
    `Your unique scratch: ${root}/scratch/\nParent-owned artifacts: ${root}/artifacts/\nPromotion allowlist: []\nPer-file and cumulative promoted-artifact limit: 0 bytes. You may save the source-only structured result JSON to ${root}/scratch/source-result.json for parent parsing, and return the same complete JSON in your response. That file is a message copy, not local-execution evidence, and must never be cited as an artifact. Do not write anywhere else. All target-controlled execution is blocked because no complete memory and cumulative disk sandbox controls are established. Use source-only checks, method source, artifact null. A candidate needing behavioral proof must be needs_validation and explain that exact blocker; do not fabricate an observed result. Never invoke project code, test runners, package scripts, containers, or external services. Never read ignored local env, credential or MCP-settings files. Cite secret-bearing source locations without copying a real secret value.`,
    fs.readFileSync(path.join(skill, 'HUNTING.md'), 'utf8').split('## Structured hunter result\n')[1].split('## Parent consolidation')[0],
    `Full report schema, including the confirmed and needs_validation branches copied verbatim:\n${schema}`,
  ].join('\n\n');
  fs.writeFileSync(path.join(root, 'scratch', 'assignment.md'), prompt);
  return { agentId, units: units.length, prompt: path.join(root, 'scratch', 'assignment.md') };
}

function checkPlan() {
  const ledger = readJson('coverage-ledger.json');
  let maps = 0;
  for (const unit of ledger) {
    for (const ref of [...(unit.ordinary_attack_class_block ? [unit.ordinary_attack_class_block] : []), ...unit.selected_companion_blocks, ...unit.excluded_blocks.map(item => item.block)]) {
      blockText(ref);
      maps++;
    }
    for (const start of unit.starting_paths) if (!fs.existsSync(path.join('/Users/xirothedev/workspace/graveshift', start))) throw new Error(`Missing starting path: ${start}`);
    for (const field of ['surface', 'boundary', 'subsystem']) {
      const file = unit.canonical_refs[field].split('#')[0];
      if (!fs.existsSync(path.join('/Users/xirothedev/workspace/graveshift', file))) throw new Error(`Missing canonical source path: ${file}`);
    }
  }
  console.log(`PASS: ${ledger.length} units have real starting/canonical paths and ${maps} exact skill block references`);
}

if (require.main === module) {
  const action = process.argv[2];
  if (action === 'seed') console.log(`Seeded ${seed(readJson('coverage-plan.json')).length} units`);
  else if (action === 'append-plan') console.log(`Appended ${seed(readJson(process.argv[3]), {append: true, wave: Number(process.argv[4])}).length} units`);
  else if (action === 'assign') console.log(JSON.stringify(assign(process.argv[3])));
  else if (action === 'assign-all') {
    for (const group of readJson('coverage-plan.json')) console.log(JSON.stringify(assign(group.id)));
  }
  else if (action === 'check-plan') checkPlan();
  else throw new Error('Unknown action');
}

module.exports = { blocks, blockText, fence, readJson, writeJson, saveLedger, seed, assign, run, skill, schema };
