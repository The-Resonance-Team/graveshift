import {
  assertBranchSlug,
  assertPayloadSize,
  assertPolicyAllow,
  fail,
  redactPatch,
  repoRules,
  validatePatch,
} from './one-shot';

try {
  assertBranchSlug(process.env.BRANCH_SLUG);
  assertPolicyAllow(process.env.POLICY_DECISION);
  if (!process.env.MODEL_API_KEY) throw new Error('model key is missing');
  const payload = assertPayloadSize(process.env.PATCH_PAYLOAD);

  const rules = await repoRules();
  const patch = redactPatch(validatePatch(payload, rules));
  validatePatch(JSON.stringify(patch), rules);

  // Only the parsed and redacted patch reaches disk; the raw payload never does.
  await Bun.write('patch.json', `${JSON.stringify(patch, null, 2)}\n`);
} catch (error) {
  fail(error);
}
