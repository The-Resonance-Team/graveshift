const fs = require('node:fs');
const path = require('node:path');
const audit = require('./audit-tools.cjs');
const validator = require(path.join(audit.skill, 'validate-findings.cjs'));
const coverageValidator = require(path.join(audit.skill, 'validate-coverage-ledger.cjs'));
const schema = JSON.parse(audit.schema);

function requireThat(value, message) { if (!value) throw new Error(message); }
function sameSet(left, right) { return left.length === right.length && left.every(item => right.includes(item)); }
function uniquePaths(checks) { return [...new Set(checks.flatMap(check => check.reviewed_paths))].sort(); }

function hunter(resultFile, agentId) {
  requireThat(coverageValidator.isSafeAgentId(agentId), 'Unsafe agent ID');
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  requireThat(result && Array.isArray(result.units) && Array.isArray(result.candidates) && Array.isArray(result.hardening) && Array.isArray(result.uncovered), 'Malformed hunter result');
  const ledger = audit.readJson('coverage-ledger.json');
  const assigned = ledger.filter(unit => unit.agent_id === agentId && unit.status === 'in_progress');
  const ids = result.units.map(unit => unit.coverage_id);
  requireThat(new Set(ids).size === ids.length && sameSet(ids, assigned.map(unit => unit.coverage_id)), 'Assigned coverage IDs missing or duplicated');
  const records = result.candidates.map(candidate => {
    requireThat(candidate.proposed_verdict === 'needs_validation', 'Only source-grounded needs_validation candidates may survive without target execution');
    const { proposed_verdict, ...record } = candidate;
    return { verdict: proposed_verdict, ...record };
  }).sort((a, b) => a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0);
  const recordErrors = validator.validateDocument(records, schema);
  requireThat(!recordErrors.length, recordErrors.join('\n'));
  const fingerprints = records.map(record => record.fingerprint);
  for (const item of result.units) {
    const unit = ledger.find(value => value.coverage_id === item.coverage_id);
    requireThat(['covered', 'candidate', 'blocked'].includes(item.disposition), 'Invalid hunter disposition');
    requireThat(Array.isArray(item.checks) && item.checks.length, 'Missing owned checks');
    for (const check of item.checks) {
      requireThat(check.agent_id === agentId && check.method === 'source' && check.artifact === null, 'Invalid source-check ownership');
    }
    requireThat(sameSet(item.reviewed_paths, uniquePaths(item.checks)), 'Reviewed paths must equal owned-check union');
    requireThat(item.candidate_fingerprints.every(value => fingerprints.includes(value)), 'Unit links an absent result fingerprint');
    Object.assign(unit, {status: item.disposition, reviewed_paths: item.reviewed_paths, local_checks: item.checks, result_fingerprints: item.candidate_fingerprints, unresolved: item.unresolved, hardening_notes: result.hardening});
  }
  for (const record of records) requireThat(result.units.some(unit => unit.candidate_fingerprints.includes(record.fingerprint)), 'Candidate has no unit');
  audit.saveLedger(ledger);
  const existingFile = path.join(audit.run, 'candidate-records.json');
  const existing = fs.existsSync(existingFile) ? JSON.parse(fs.readFileSync(existingFile, 'utf8')) : [];
  for (const record of records) {
    const found = existing.find(item => item.fingerprint === record.fingerprint);
    if (found) {
      const duplicatesFile = path.join(audit.run, 'duplicate-candidates.json');
      const duplicates = fs.existsSync(duplicatesFile) ? JSON.parse(fs.readFileSync(duplicatesFile, 'utf8')) : [];
      duplicates.push({ agent_id: agentId, record });
      fs.writeFileSync(duplicatesFile, `${JSON.stringify(duplicates, null, 2)}\n`);
    } else existing.push(record);
  }
  existing.sort((a, b) => a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0);
  audit.writeJson('candidate-records.json', existing);
  const root = path.join(audit.run, 'source-results');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, `${agentId}.json`), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Accepted ${result.units.length} units, ${records.length} candidates, ${result.uncovered.length} uncovered entries from ${agentId}`);
}

function candidateVerifier(resultFile, agentId) {
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  requireThat(['needs_validation', 'rejected'].includes(result.decision), 'Invalid candidate-verifier decision');
  requireThat(result.record?.verdict === result.decision, 'Decision/record mismatch');
  const errors = validator.validateDocument([result.record], schema);
  requireThat(!errors.length, errors.join('\n'));
  const candidates = audit.readJson('candidate-records.json');
  requireThat(candidates.some(item => item.fingerprint === result.record.fingerprint), 'Unknown candidate fingerprint');
  const finalFile = path.join(audit.run, 'findings.json');
  const records = fs.existsSync(finalFile) ? JSON.parse(fs.readFileSync(finalFile, 'utf8')) : [];
  requireThat(!records.some(item => item.fingerprint === result.record.fingerprint), 'Candidate already decided');
  records.push(result.record);
  records.sort((a, b) => a.fingerprint < b.fingerprint ? -1 : a.fingerprint > b.fingerprint ? 1 : 0);
  audit.writeJson('findings.json', records);
  const ledger = audit.readJson('coverage-ledger.json');
  for (const unit of ledger.filter(unit => unit.result_fingerprints.includes(result.record.fingerprint))) {
    unit.validation_decisions ??= [];
    unit.validation_decisions.push({fingerprint: result.record.fingerprint, phase: 3, agent_id: agentId, verdict: result.decision});
    const paths = uniquePaths([{reviewed_paths: [...result.record.trace.map(item => item.file), ...result.record.evidence.map(item => item.file)]}]);
    unit.local_checks.push({agent_id: agentId, reviewed_paths: paths, invariant: `Independent candidate validation: ${result.record.title}`, method: 'source', result: result.decision === 'rejected' ? result.record.reason : result.record.blockers.join(' '), artifact: null});
    unit.reviewed_paths = uniquePaths(unit.local_checks);
  }
  audit.saveLedger(ledger);
  console.log(`Recorded independent ${result.decision}: ${result.record.fingerprint}`);
}

function finalVerifier(resultFile, agentId) {
  requireThat(coverageValidator.isSafeAgentId(agentId), 'Unsafe final verifier ID');
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  const records = audit.readJson('findings.json');
  if (result.decision === 'replace') {
    const errors = validator.validateDocument([result.record], schema);
    requireThat(!errors.length && typeof result.reason === 'string' && result.reason.length, errors.join('\n') || 'Replacement lacks reason');
    requireThat(records.some(item => item.fingerprint === result.record.fingerprint), 'Unknown replacement fingerprint');
    const file = path.join(audit.run, 'pending-replacements.json');
    const replacements = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    replacements.push({agent_id: agentId, ...result});
    audit.writeJson('pending-replacements.json', replacements);
    console.log(`Replacement needs a fresh independent verifier: ${result.record.fingerprint}`);
    return;
  }
  requireThat(result.decision === 'verified' && typeof result.fingerprint === 'string', 'Malformed final verification result');
  requireThat(records.some(item => item.fingerprint === result.fingerprint), 'Unknown verified fingerprint');
  const file = path.join(audit.run, 'record-verification.json');
  const reviews = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  requireThat(!reviews.some(item => item.fingerprint === result.fingerprint), 'Record already finally verified');
  reviews.push({agent_id: agentId, ...result});
  audit.writeJson('record-verification.json', reviews);
  const ledger = audit.readJson('coverage-ledger.json');
  const record = records.find(item => item.fingerprint === result.fingerprint);
  for (const unit of ledger.filter(unit => unit.result_fingerprints.includes(result.fingerprint))) {
    unit.validation_decisions ??= [];
    unit.validation_decisions.push({fingerprint: result.fingerprint, phase: 5, agent_id: agentId, verdict: record.verdict});
    const paths = [...new Set([...record.trace.map(item => item.file), ...record.evidence.map(item => item.file)])].sort();
    unit.local_checks.push({agent_id: agentId, reviewed_paths: paths, invariant: `Independent final record verification: ${record.title}`, method: 'source', result: `The final ${record.verdict} record's trace, controls, boundary and remaining blockers were independently verified against current source.`, artifact: null});
    unit.reviewed_paths = uniquePaths(unit.local_checks);
  }
  audit.saveLedger(ledger);
  console.log(`Final record independently verified: ${result.fingerprint}`);
}

if (require.main === module) {
  const [action, file, agentId] = process.argv.slice(2);
  if (action === 'hunter') hunter(file, agentId);
  else if (action === 'candidate-verifier') candidateVerifier(file, agentId);
  else if (action === 'final-verifier') finalVerifier(file, agentId);
  else throw new Error('Unknown consolidation action');
}

module.exports = { hunter, candidateVerifier, finalVerifier, uniquePaths };
