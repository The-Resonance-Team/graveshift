// Bounded, offline reproduction of fixer/recovery/parent-only-publication-binding.
// Import the real REST client and the real recovery wrapper from the read-only target.
import { createRestClient } from '/target/packages/fixer/src/rest.ts';
import { recoverPublication } from '/target/packages/fixer/src/verified-publication.ts';

const REPO = 'acme/widgets';
const BRANCH = 'refs/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue';
const HEAD = BRANCH.replace(/^refs\/heads\//, '');
const BASE_SHA = 'base-1111111111111111111111111111111111111111';
// The originally verified tree digest (tree of C_verified).
const VERIFIED_TREE = 'tree-verified-2222222222222222222222222222222222222222';
// A second, harmless tree digest (tree of C_substitute) -- deliberately different.
const SUBST_TREE = 'tree-substituted-33333333333333333333333333333333333333';
const VERIFIED_HEAD = 'commit-verified-4444444444444444444444444444444444444444';
const SUBST_HEAD = 'commit-substituted-55555555555555555555555555555555555555';
const DRAFT_NUMBER = 7;
const DRAFT_URL = 'https://github.com/acme/widgets/pull/7';

const calls: string[] = [];
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// Recording transport: returns one open draft whose head is the SUBSTITUTE commit.
// Both commits have the SAME single parent (BASE_SHA), but different tree digests.
const transport: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const u = new URL(url);
  const method = init?.method ?? 'GET';
  calls.push(`${method} ${u.pathname}${u.search}`);

  if (u.pathname === `/repos/${REPO}/pulls`) {
    return json([
      {
        number: DRAFT_NUMBER,
        html_url: DRAFT_URL,
        draft: true,
        head: { ref: HEAD, sha: SUBST_HEAD, repo: { full_name: REPO } },
      },
    ]);
  }

  const commitMatch = u.pathname.match(/^\/repos\/acme\/widgets\/git\/commits\/([^/]+)$/);
  if (commitMatch) {
    const sha = decodeURIComponent(commitMatch[1]!);
    if (sha === SUBST_HEAD) {
      return json({ sha: SUBST_HEAD, parents: [{ sha: BASE_SHA }], tree: { sha: SUBST_TREE } });
    }
    if (sha === VERIFIED_HEAD) {
      return json({ sha: VERIFIED_HEAD, parents: [{ sha: BASE_SHA }], tree: { sha: VERIFIED_TREE } });
    }
    return json({ message: 'not found' }, 404);
  }

  if (u.pathname === `/repos/${REPO}/git/ref/heads/${HEAD}`) {
    return json({ object: { sha: SUBST_HEAD } });
  }

  return json({ message: `unexpected path ${u.pathname}` }, 404);
};

const auth = { installationToken: async (_repo: string) => 'dummy-token' };
const client = createRestClient(auth, transport);

// Fetch both tree digests to prove the substituted tree differs from the verified tree
// while both commits share the same single parent.
const verifiedTree = await client.getCommitTree(REPO, VERIFIED_HEAD);
const substitutedTree = await client.getCommitTree(REPO, SUBST_HEAD);

// The persisted publication intent carries ONLY repo/branch/baseSha (no expected tree).
// This is exactly the shape of PublicationPlan from verified-publication.ts:8-12.
const plan = { repo: REPO, branch: BRANCH, baseSha: BASE_SHA };
const planKeys = Object.keys(plan).sort();

let directResult: unknown = null;
let directError: string | undefined;
try {
  directResult = await client.getExistingDraft(plan.repo, plan.branch, plan.baseSha);
} catch (e) {
  directError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

let recoveryResult: unknown = null;
let recoveryError: string | undefined;
try {
  recoveryResult = await recoverPublication(client, plan);
} catch (e) {
  recoveryError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

const treesDiffer = verifiedTree !== substitutedTree;
const accepted =
  directError === undefined &&
  recoveryError === undefined &&
  directResult !== null &&
  recoveryResult !== null;
const headShaAccepted =
  (directResult as { headSha?: string } | null)?.headSha === SUBST_HEAD;

const verdict = accepted && treesDiffer && headShaAccepted ? 'confirmed' : 'inconclusive';

console.log(
  JSON.stringify(
    {
      lead: 'fixer/recovery/parent-only-publication-binding',
      verdict,
      observed: {
        plan,
        planKeys,
        planCarriesExpectedTree: planKeys.includes('treeSha') || planKeys.includes('expectedTree'),
        baseSha: BASE_SHA,
        verifiedTree,
        substitutedTree,
        treesDiffer,
        bothCommitsShareSingleParent: true,
        draftHeadSha: SUBST_HEAD,
        returnedByGetExistingDraft: directResult,
        returnedByRecoverPublication: recoveryResult,
        headShaAccepted,
        directError,
        recoveryError,
        transportCalls: calls,
        sourceLines: [
          'packages/fixer/src/rest.ts:140-183 (getExistingDraft: parent-only checks at 168-175, no tree check)',
          'packages/fixer/src/verified-publication.ts:8-12 (PublicationPlan = repo/branch/baseSha only)',
          'packages/fixer/src/verified-publication.ts:29-41 (recoverPublication calls getExistingDraft with those three fields)',
        ],
      },
      reason: accepted
        ? 'The substituted head was accepted by both getExistingDraft and the real recoverPublication wrapper. getExistingDraft (rest.ts:140-183) validates only that the draft head sha matches the ref and that the head commit has exactly one parent equal to baseSha (rest.ts:168-175); it never reads the commit tree or compares it to the originally verified tree digest. The persisted PublicationPlan (verified-publication.ts:8-12) contains only repo/branch/baseSha, so no expected-tree binding is possible. Two distinct trees with the same single parent are therefore interchangeable at recovery time.'
        : `Recovery did not accept the substituted head as expected (directError=${String(directError)}, recoveryError=${String(recoveryError)}, treesDiffer=${treesDiffer}, headShaAccepted=${headShaAccepted}).`,
    },
    null,
    2,
  ),
);
