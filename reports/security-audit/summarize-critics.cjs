const fs = require('node:fs');
const path = require('node:path');
const audit = require('./audit-tools.cjs');

const results = [];
for (const [phase, agentId] of [['post-wave', 'critic-wave1'], ['final-clean', 'critic-final']]) {
  const file = path.join(audit.run, 'agents', agentId, 'scratch', 'source-result.json');
  if (!fs.existsSync(file)) throw new Error(`Missing ${phase} critic result`);
  const result = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(result.missing_units) || !Array.isArray(result.reassign_ids) || typeof result.stop !== 'boolean') {
    throw new Error(`Malformed ${phase} critic result`);
  }
  results.push({phase, agent_id: agentId, result});
}
if (results[1].result.missing_units.length || results[1].result.reassign_ids.length || !results[1].result.stop) {
  throw new Error('Final-clean critic did not accept coverage; cannot complete run');
}
audit.writeJson('critic-results.json', results);
console.log('Recorded accepted post-wave and final-clean critic results');
