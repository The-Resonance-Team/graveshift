import {
  assertBaseRef,
  assertBranchSlug,
  assertPayloadSize,
  evaluatePolicyAllow,
  fail,
  loadOneShotPolicy,
  redactPatch,
  validatePatch,
} from './one-shot';

try {
  assertBranchSlug(process.env.BRANCH_SLUG);
  assertBaseRef(process.env.BASE_REF);
  const { policy, rules } = await loadOneShotPolicy();
  evaluatePolicyAllow(process.env.POLICY_DECISION, policy);
  const payload = assertPayloadSize(process.env.PATCH_PAYLOAD);

  const patch = redactPatch(validatePatch(payload, rules));
  validatePatch(JSON.stringify(patch), rules);

  // Only the parsed and redacted patch reaches disk; the raw payload never does.
  await Bun.write('patch.json', `${JSON.stringify(patch, null, 2)}\n`);
} catch (error) {
  fail(error);
}
