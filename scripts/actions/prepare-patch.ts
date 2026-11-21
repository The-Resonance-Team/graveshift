import {
  assertBaseRef,
  assertBranchSlug,
  assertPayloadSize,
  evaluateSignedPolicyAllow,
  fail,
  loadOneShotPolicy,
  redactPatch,
  validatePatch,
} from './one-shot';

try {
  assertBranchSlug(process.env.BRANCH_SLUG);
  assertBaseRef(process.env.BASE_REF);
  const payload = assertPayloadSize(process.env.PATCH_PAYLOAD);
  const { policy, rules } = await loadOneShotPolicy();
  evaluateSignedPolicyAllow(
    process.env.POLICY_DECISION,
    process.env.POLICY_SIGNATURE,
    process.env.POLICY_SIGNING_KEY,
    {
      repository: process.env.GITHUB_REPOSITORY ?? '',
      workItemId: process.env.WORK_ITEM_ID ?? '',
      incidentRef: process.env.INCIDENT_REF ?? '',
      branchSlug: process.env.BRANCH_SLUG ?? '',
      baseRef: process.env.BASE_REF ?? '',
      baseSha: process.env.BASE_SHA ?? '',
      prTitle: process.env.PR_TITLE ?? '',
      patchPayload: payload,
    },
    policy,
  );

  const patch = redactPatch(validatePatch(payload, rules));
  validatePatch(JSON.stringify(patch), rules);

  // Only the parsed and redacted patch reaches disk; the raw payload never does.
  await Bun.write('patch.json', `${JSON.stringify(patch, null, 2)}\n`);
} catch (error) {
  fail(error);
}
