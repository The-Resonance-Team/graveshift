import json, copy

base = "/Users/xirothedev/security-audit-skill/graveshift/run-1"
data = json.load(open(base + "/findings.json"))
rec = None
for x in data:
    if (
        isinstance(x, dict)
        and x.get("fingerprint")
        == "deploy/compose/api-service-overlay-retains-control-plane-authority"
    ):
        rec = x
        break
assert rec is not None
r = copy.deepcopy(rec)

new_desc = (
    "Source review confirms the documented combined launch (docs/DEMO.md:20) lists deploy/compose/graveshift.compose.yml before deploy/compose/demo.compose.yml, and both files declare services.api under the same project name graveshift. "
    "Under standard Compose multi-file merge semantics (confirmed here by a parent-side config render of scratch copies), the later demo definition sets image, build.context and x-app environment/networks but does not use !reset or !override (no such directives exist in deploy/compose/), so the platform api definition's environment keys (internal tokens, OAuth JWT secret, root-bootstrap fields at graveshift.compose.yml:94-100), build.dockerfile, command, profiles and core network are not cleared by source. "
    "A concrete lower-trust principal exists: .kiro/agents/chaos-witch.json:9 denies shell and denies fs_write except under examples/**, so it can alter the example build context, Dockerfile and launcher but not deploy/platform source. "
    "The finding does NOT assert that the unchanged combination leaks real secrets: the retained platform command src/main.ts and build.dockerfile deploy/compose/bun.Dockerfile are absent from the example context (verified: no examples/haunted-candy-shop/src/main.ts and no examples/haunted-candy-shop/deploy/), and the retained api profile is not enabled by the documented command. "
    "A trusted parent-side `docker compose config --format json` render of scratch copies with a dummy marker confirmed that, with the api profile enabled, the merged api service selects the examples-controlled image while retaining the platform credential environment keys and the core network; no image build or process execution was performed, and delivery of real credentials remains owner/conditional."
)
assert (
    r["description"].startswith("Source review confirms")
    and "kept as needs_validation" in r["description"]
)
r["description"] = new_desc

assert (
    r["conditions"][0]["description"]
    == "The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace."
)
r["conditions"][0]["description"] = (
    "The observation was a trusted parent-side `docker compose config --format json` render of bounded dummy-data scratch copies of the two maintained manifests; "
    "no container was run, and deployment preconditions are recorded in the source trace."
)

assert (
    r["execution"]["instructions"][0]
    == "Run 07-compose-overlay.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result."
)
r["execution"]["instructions"][0] = (
    "Parent-side only: copy deploy/compose/graveshift.compose.yml and deploy/compose/demo.compose.yml to scratch; in the demo copy set `security_opt: !reset [no-new-privileges:true]` "
    "(the unchanged pair fails Compose v5 with duplicate no-new-privileges:true); run `docker compose --profile api -f <support copy> -f <demo copy> config --format json` with an 11-key dummy environment. "
    "The rendered api service is the single structured observed result; no container harness was used and no target source was edited."
)

assert (
    r["confidence"]["reason"]
    == "The minimum boundary result was observed in a compliant container with dummy data."
)
r["confidence"]["reason"] = (
    "The minimum boundary result was observed in a trusted parent-side Compose config render of scratch copies with dummy data; "
    "no real secret was read and no container was executed."
)

reason = (
    "All cited trace/evidence paths, lines, scopes and operations verify against source; the entry point is a real examples-only lower-trust principal, the last trace item is the merged-api sink, and the parent-side rendered api "
    "(image haunted-candy-shop:local, platform credential env keys with dummy values, networks candy+core) proves that exact invariant. Severity (medium/medium/medium), remediation and the dummy-data scope do not exceed the demonstrated result. "
    "Non-material correction only: conditions[0].description, execution.instructions[0] and confidence.reason wrongly placed the observation inside a compliant container and named a nonexistent 07-compose-overlay.ts container harness, whereas the result came from a trusted parent-side docker compose config render of scratch copies; the stale description wording that called the result unobserved/kept as needs_validation was aligned with the confirmed render. "
    "Verdict, observed result, impact, severity, trace and evidence are unchanged."
)

out = {"decision": "replace", "reason": reason, "record": r}
path = base + "/agents/confirm-07b/scratch/source-result.json"
with open(path, "w") as f:
    json.dump(out, f, indent=2, ensure_ascii=False)
    f.write("\n")
print("WROTE", path)
