Your goal is to find source-grounded security invariant failures in the assigned coverage units below. Return exactly one JSON object matching the structured-result contract at the end of this prompt.

# Graveshift audit architecture

Target: `/Users/xirothedev/workspace/graveshift`. Reviewed HEAD: `d99415203c22eccbefcbee8d7588ccb227534b53`. Profile: standard. Source-only review of the full runtime, packages, examples, CI, hooks, packaging and deployment definitions. The worktree has an untracked example configuration in scope. Untracked Sentry research/report documents are excluded. No prior compatible ledger or findings were found in the default audit location. No carried findings or hunter exclusions exist. `source-manifest.json` records current source hashes for later comparison.

## Product and principals

Graveshift watches services, ingests Events, detects Hauntings, builds a Diagnosis, routes Work items and prepares draft pull requests. It never merges fixes. A separate actuator supports approved runtime restart/scale actions. Accounts register and join Organizations as owners or members. Organizations directly own Projects. One deployment serves multiple Organizations; `projectId` scopes Events, subjects, durable rows, Credentials and Audit chains (`GLOSSARY.md:9`, `docs/adr/0023-organization-is-the-tenant-root.md:6`). Organization owners create scoped OAuth clients. OAuth clients issue delegated MCP/plugin Credentials. Plugin producers and watched workloads supply lower-trust telemetry. MCP callers read scoped state and request policy proposals. Models, repository contents and verification commands are untrusted relative to host credentials and publication authority. Operators control boot config, integration endpoints, provider/GitHub keys and infrastructure.

Sentry is a source-documented comparator for Organization/Project access and DSN/envelope ingestion. Graveshift deliberately omits Sentry's Team layer; this is an intended access model, not a defect. Collector and Sentry Events intentionally remain unassigned to a Deployment when no commit SHA is supplied (`docs/adr/0027-deployment-is-the-triage-root.md:13`).

## Stack and active source paths

Bun/TypeScript workspaces contain a NestJS 12.6 API, Effect 4.1 daemon, Zod/class-validator contracts, Prisma 7.10/PostgreSQL, NATS JetStream, AI SDK provider adapters, Docker/Kubernetes collectors and GitHub publication adapters. Bun is pinned to 1.4.4; the installed executable resolves to 1.4.5. Locally present dependencies do not authorize execution.

`apps/api/src/main.ts` creates the app, connects Prisma, bootstraps identity and listens. `apps/api/src/stdio.ts` starts the same MCP context with trusted local stdio semantics. `apps/daemon/src/main.ts` obtains boot config, starts collectors and the Event consumer, and exposes private read/command handlers plus public health. `packages/actuator/src/main.ts` opens local durable admission state and the action handler. Support Compose defines an optional API, actuator, broker/store and proxies; it does not launch a daemon. The demo has separate API/worker launchers. Kubernetes/Helm/kind are explicitly incomplete scaffolds. One-shot workflows use separate trusted and target checkouts. Several README passages are stale; current source determines reachability.

## Inputs, transformations and boundaries

- HTTP identity routes use account JWTs; Organization membership and owner checks live in `identity.service.ts`. OAuth JWTs pin HS256, issuer/audience and current registered scope (`auth/oauth-principal.ts`). Credentials are random 256-bit values, stored hashed, scoped at issue and checked for expiry/revocation on use.
- Plugin `/api/events` checks Project/service binding, validates/redacts the envelope, resolves Deployment in the bound Project and publishes. Sentry `/api/:projectId/envelope` checks the same Credential component, a numeric Project and service binding, then parses bounded raw frames, maps and redacts. Telemetry can influence Diagnosis and later fixes; shape validation is not provenance.
- MCP HTTP pairs bearer and scope guards. Project context flows to `HttpMcpBackend` and private daemon reads. Public tools include incidents, logs, metrics, audit and proposals; proposals do not execute actions. Event polling uses a custom SDK bridge. Stdio trusts its local process but project-dependent reads/proposals still require a bound Project. Collector inventory/log/metric reads use host sources; verify their isolation independently of durable Project reads.
- Internal API routes require the API internal token and stored Project grants. API-to-daemon uses a different required token and a loopback-only listener. Durable Work/Fix state uses command hashes, leases and publication recovery; audit is append-only and chained. Review normal, replay, answer, migration and uncertain-effect paths.
- Broker subject/body equality, granted Project intake and bounded schemas protect Event processing. Collectors consume workload metadata/logs and configured metrics. Trace label provenance, deduplication namespaces, retries and downstream state.
- Gateway/agent/diagnoser/patch modules assemble untrusted context, constrain capabilities, account spend, require audit acknowledgment and validate model output. Repository selection uses the instance service mapping; inspect its Project binding. Fixer source snapshots bind deployment/tree/blob identity; path guards, OS sandboxing, workspace checks and verification receipts precede GitHub writes. Publication and recovery must use the same verified object.
- Actuator requests require HMAC, approval, current policy, durable single-use admission and bounded targets. The production launcher currently uses local admission and `durableAudit: false`; do not infer a durable remote handoff from documentation. Actions and one-shot workflows are parallel privileged paths.

## Execution limits and coverage

Do not run target-controlled code, tests, builds, package scripts, containers, browsers or fixtures. Complete OS-enforced memory, process, CPU, per-file, total-disk, filesystem and wall-clock controls have not been established. Network and filesystem declarations in target code are not an audit sandbox. No dependencies will be installed, no deployed/shared endpoints contacted, and no scratch output promoted. All checks are source-only with null artifacts. Any source-grounded candidate requiring behavior or deployment evidence remains `needs_validation` without severity. Trusted parent-side validators may check parent-owned audit JSON.

Selected companions: HTTP/authentication, data isolation/lifecycle, AI/LLM, protocols/messaging, resource availability, supply chain/release, cloud/deployment and local IPC. They match actual identity, project-data, model-action, broker, process, CI, workload and private-daemon boundaries. No browser UI or native unsafe-memory boundary is source-visible in the product. The ledger carries exact selected/excluded blocks per unit. Eleven first-wave hunter assignments cover 65 units; two distinct critic passes and two fresh verification passes per surviving candidate are planned. No strict agent budget is set.


Target: /Users/xirothedev/workspace/graveshift
Agent ID: hunt-supply-deploy
Assigned coverage units and exact block maps:
[
  {
    "coverage_id": ".github%2Fworkflows%2Foneshot-reusable.yml%23workflow_call::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::SUPPLY-CHAIN-AND-RELEASE.md%23Build-context%20inclusion",
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "subsystem": ".github",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "attack_class": "Build context and packaged secret exposure",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Cryptography and secrets",
    "selected_companion_blocks": [
      "SUPPLY-CHAIN-AND-RELEASE.md#Core discipline",
      "SUPPLY-CHAIN-AND-RELEASE.md#Build-context inclusion",
      "SUPPLY-CHAIN-AND-RELEASE.md#Universal moves",
      "SUPPLY-CHAIN-AND-RELEASE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Build context and packaged secret exposure."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ]
  },
  {
    "coverage_id": ".github%2Fworkflows%2Foneshot-reusable.yml%23workflow_call::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::SUPPLY-CHAIN-AND-RELEASE.md%23Build-to-promotion%20substitution",
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "subsystem": ".github",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "attack_class": "Signed patch and promotion artifact binding",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [
      "SUPPLY-CHAIN-AND-RELEASE.md#Core discipline",
      "SUPPLY-CHAIN-AND-RELEASE.md#Build-to-promotion substitution",
      "SUPPLY-CHAIN-AND-RELEASE.md#Universal moves",
      "SUPPLY-CHAIN-AND-RELEASE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Signed patch and promotion artifact binding."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ]
  },
  {
    "coverage_id": ".github%2Fworkflows%2Foneshot-reusable.yml%23workflow_call::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::SUPPLY-CHAIN-AND-RELEASE.md%23Dependency%20source%20and%20namespace%20confusion",
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "subsystem": ".github",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "attack_class": "Dependency and generated input trust",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries",
    "selected_companion_blocks": [
      "SUPPLY-CHAIN-AND-RELEASE.md#Core discipline",
      "SUPPLY-CHAIN-AND-RELEASE.md#Dependency source and namespace confusion",
      "SUPPLY-CHAIN-AND-RELEASE.md#Universal moves",
      "SUPPLY-CHAIN-AND-RELEASE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Dependency and generated input trust."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ]
  },
  {
    "coverage_id": ".github%2Fworkflows%2Foneshot-reusable.yml%23workflow_call::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::SUPPLY-CHAIN-AND-RELEASE.md%23Untrusted%20code%20in%20a%20privileged%20workflow",
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "subsystem": ".github",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "attack_class": "Privileged workflow code and artifact producer identity",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "SUPPLY-CHAIN-AND-RELEASE.md#Core discipline",
      "SUPPLY-CHAIN-AND-RELEASE.md#Untrusted code in a privileged workflow",
      "SUPPLY-CHAIN-AND-RELEASE.md#Universal moves",
      "SUPPLY-CHAIN-AND-RELEASE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Privileged workflow code and artifact producer identity."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ]
  },
  {
    "coverage_id": ".github%2Fworkflows%2Foneshot-reusable.yml%23workflow_call::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::SUPPLY-CHAIN-AND-RELEASE.md%23Workflow%20command%20and%20expression%20confusion",
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "subsystem": ".github",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "attack_class": "Workflow expression, shell and path input handling",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Injection",
    "selected_companion_blocks": [
      "SUPPLY-CHAIN-AND-RELEASE.md#Core discipline",
      "SUPPLY-CHAIN-AND-RELEASE.md#Workflow command and expression confusion",
      "SUPPLY-CHAIN-AND-RELEASE.md#Universal moves",
      "SUPPLY-CHAIN-AND-RELEASE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Workflow expression, shell and path input handling."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ]
  },
  {
    "coverage_id": "deploy%2Fcompose%2Fgraveshift.compose.yml%23services::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::CLOUD-AND-DEPLOYMENT.md%23Security-control%20precedence%20drift",
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "subsystem": ".github",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "attack_class": "Deployment security-control precedence",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Business logic",
    "selected_companion_blocks": [
      "CLOUD-AND-DEPLOYMENT.md#Core discipline",
      "CLOUD-AND-DEPLOYMENT.md#Security-control precedence drift",
      "CLOUD-AND-DEPLOYMENT.md#Universal moves",
      "CLOUD-AND-DEPLOYMENT.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Access control",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Deployment security-control precedence."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ]
  },
  {
    "coverage_id": "deploy%2Fcompose%2Fgraveshift.compose.yml%23services::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::CLOUD-AND-DEPLOYMENT.md%23Unexpected%20service%20or%20management-plane%20reachability",
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "subsystem": ".github",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "attack_class": "Deployment management-plane reachability",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "CLOUD-AND-DEPLOYMENT.md#Core discipline",
      "CLOUD-AND-DEPLOYMENT.md#Unexpected service or management-plane reachability",
      "CLOUD-AND-DEPLOYMENT.md#Universal moves",
      "CLOUD-AND-DEPLOYMENT.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Deployment management-plane reachability."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ]
  },
  {
    "coverage_id": "deploy%2Fk8s%2Frbac.yaml%23graveshift-actuator::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::CLOUD-AND-DEPLOYMENT.md%23Host%20or%20control-plane%20capability%20exposure",
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "subsystem": ".github",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "attack_class": "Container and cluster capability authority",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "CLOUD-AND-DEPLOYMENT.md#Core discipline",
      "CLOUD-AND-DEPLOYMENT.md#Host or control-plane capability exposure",
      "CLOUD-AND-DEPLOYMENT.md#Universal moves",
      "CLOUD-AND-DEPLOYMENT.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Container and cluster capability authority."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ]
  },
  {
    "coverage_id": "powers%2Fgraveshift%2Fmcp.json%23graveshift::scripts%2Factions%2Fpolicy-signature.ts%23verifyPolicySignature::.github::SUPPLY-CHAIN-AND-RELEASE.md%23Plugin%20and%20extension%20trust%20expansion",
    "surface": "One-shot Actions inputs, dependency/build context and maintained deployment files",
    "subsystem": ".github",
    "boundary": "Contributor and platform job inputs to trusted CI secrets, artifacts and deployed control-plane capabilities",
    "attack_class": "Kiro hooks, agents and Power authority",
    "starting_paths": [
      ".github",
      ".kiro",
      "powers",
      "scripts",
      "tests/actions-scripts.test.ts",
      "tests/actions-workflows.test.ts",
      "deploy",
      "package.json",
      "bun.lock",
      "graveshift.config.yaml",
      ".gitignore",
      "examples"
    ],
    "ordinary_attack_class_block": "ATTACK-CLASSES.md#Access control",
    "selected_companion_blocks": [
      "SUPPLY-CHAIN-AND-RELEASE.md#Core discipline",
      "SUPPLY-CHAIN-AND-RELEASE.md#Plugin and extension trust expansion",
      "SUPPLY-CHAIN-AND-RELEASE.md#Universal moves",
      "SUPPLY-CHAIN-AND-RELEASE.md#Validation rules"
    ],
    "excluded_blocks": [
      {
        "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
        "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
      },
      {
        "block": "CLIENT-SIDE.md#DOM-based XSS",
        "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
      },
      {
        "block": "ATTACK-CLASSES.md#Injection",
        "reason": "This distinct ordinary class has a sibling unit in .github; this unit covers Kiro hooks, agents and Power authority."
      },
      {
        "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
        "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
      }
    ]
  }
]

ATTACK-CLASSES.md#Cryptography and secrets

**Cryptography and secrets** (subagent_type: `general`)
- Weak randomness for security-critical values (tokens, keys, nonces)
- Hardcoded secrets, secrets in logs, error messages, URLs, or client-visible responses
- Broken key derivation, missing HMAC verification, nonce reuse
- Timing side-channels on secret comparison
- Misuse of crypto primitives (ECB mode, unauthenticated encryption, static IVs, etc.)
- What happens when crypto operations fail? Does the error path fall back to no-crypto?

SUPPLY-CHAIN-AND-RELEASE.md#Core discipline

## Core discipline (include in every agent prompt for this domain)

```
- A mutable or known-vulnerable dependency is not a finding by itself. Show who can influence resolution, which build consumes it, and what execution or release boundary follows.
- Follow integrity across every handoff: source identity, resolved inputs, build worker, artifact identity, test result, signature/attestation, promotion, and update consumer.
- CI configuration is authorization code. Establish which event triggered a workflow, whose code runs, which secrets and tokens exist, and what it may publish or mutate.
- A checksum fetched from the same untrusted location as the artifact does not establish independent integrity. Identify the trusted root and failure behavior.
- Use `confirmed` for in-repo control-flow failures with bounded local validation. Use `needs_validation` for branch protection, hosted-runner, registry, signing-service, or production promotion facts that are not observable.
```

SUPPLY-CHAIN-AND-RELEASE.md#Build-context inclusion

**Build-context inclusion**
Secrets, local configuration, repository metadata, test fixtures, or developer artifacts enter a package or image because the build context and ignore rules exceed intended release inputs. Confirm that the resulting artifact exposes a real credential, private data, or privileged configuration.

SUPPLY-CHAIN-AND-RELEASE.md#Universal moves

## Universal moves (apply across the above)

- Walk backward from a released digest or installed update to every source, generated input, credential, worker, cache, test result, and authorization decision.
- Compare untrusted and protected workflow events side by side. Mark each persisted channel crossing between them and require an immutable identity plus producer trust.
- Review revoked key, failed download, missing attestation, partial platform release, rollback, and registry outage paths. The failure policy is part of release integrity.

SUPPLY-CHAIN-AND-RELEASE.md#Validation rules

## Validation rules (apply before reporting ANY finding here)

1. Name the lower-trust actor, controllable source/cache/artifact/metadata, consuming trusted job or updater, and resulting unauthorized publication, code inclusion, secret disclosure, or privileged execution.
2. Prove artifact identity across the broken handoff. A different mutable name or unbound digest must reach a real consumer.
3. Verify built-in package-manager, repository-host, registry, and signing defaults for the pinned version. Unknown hosted controls require `needs_validation`.
4. Keep local validation bounded: use a harmless fixture repository, dummy credential marker, local registry/config, and non-production artifact namespace. Do not publish or alter a real release.
5. Return `confirmed` only with a complete source-visible handoff and meaningful result. Return `needs_validation` with the precise branch, runner, registry, signing, or deployment fact an owner must observe.

ATTACK-CLASSES.md#Business logic

**Business logic** (subagent_type: `general`)
Hunt logic errors by hand: standard scanners cannot find them, and they yield high-impact findings. For each major workflow:
- **State machine violations**: Can you skip steps? Go backwards? Reach an invalid state? What happens if you replay a completed flow? What about partial failure — if step 2 of 3 fails, is step 1 rolled back?
- **Race conditions with business impact**: Concurrent operations that produce invalid states (double-spend, double-approve, lost updates). Focus on operations that check-then-act non-atomically.
- **Numeric/quantity manipulation**: Negative values, zero values, overflow, precision loss, type coercion between string and number.
- **Access boundary violations**: Not "does the permission check exist" but "is it the right check for the business rule?" Can input to one operation bypass a restriction enforced on a different operation for the same effect?
- **Implicit trust assumptions**: Data from storage, config, other components, or plugins assumed safe because "we validated it on the way in." What if a different code path wrote it?
- **Time-based logic**: Expiry checks, scheduling, rate windows, clock skew. What happens at exact boundary moments? What about timezone differences between components?
- **Default and fallback behavior**: What is the security posture when config is missing? When a feature flag is off? When a dependency is unavailable? When the system is mid-migration?

SUPPLY-CHAIN-AND-RELEASE.md#Build-to-promotion substitution

**Build-to-promotion substitution**
Tests, review, signature, and publication refer to mutable tags, filenames, channels, or artifact IDs rather than the same immutable digest. Check every copy, repack, architecture merge, and provenance step between build and release.

ATTACK-CLASSES.md#Chained vulnerabilities and trust boundaries

**Chained vulnerabilities and trust boundaries** (subagent_type: `general`)
Individually allowed or contained behavior can become a vulnerability when another component or lifecycle step relies on a stronger guarantee:
- **Multi-step boundary failures**: Map what a low-privilege principal may read, write, invoke, and retain, then connect only concrete outputs to later trust decisions. Confirm each prerequisite and do not assume a downstream effect.
- **Cross-component trust gaps**: Component A validates input and passes it to component B. Compare the exact guarantee A produces with what B assumes, including truncation, type coercion, normalization, tenant scope, and plugin/extension access.
- **Second-order use**: Data safe when stored may become dangerous in a later context. A field name becomes a JSON path, a slug becomes a file path, escaped text enters raw rendering, or a stored string becomes a URL, regex, template, or policy expression.
- **Scope and capability growth**: Token, API-key, plugin, OAuth, MCP, or AI capabilities become broader after delegation, refresh, caching, role change, or composition. Name the concrete operation the resulting principal should not have.
- **Timing and ordering**: Review setup, migration, soft-delete, revoke/cache expiry, check/use, and validate/consume windows. Confirm stale state is accepted before reporting.
- **Rollback and recovery**: Undelete, restore, revision rollback, and cancellation must apply current ownership, validation, and authorization. Confirm which invalid state is restored.

SUPPLY-CHAIN-AND-RELEASE.md#Dependency source and namespace confusion

**Dependency source and namespace confusion**
Resolver configuration can select an unintended public/private namespace, fallback registry, mirror, repository, or source URL. Review package names, source priority, lockfile and checksum use, alternate build files, platform-specific resolution, and first-install versus update behavior.

ATTACK-CLASSES.md#Access control

**Access control** (subagent_type: `general`)
Verify that a caller cannot do something outside its authority. Go beyond checking whether permission checks exist — verify they check the *right* permission for the *right* resource via the *right* mechanism:
- Is there a path to the same state change that checks a different (weaker) permission?
- Can a field in the request body override what the permission system intended to restrict?
- Are there endpoints that gate on authentication but forget authorization?
- Does the same resource have multiple access paths with inconsistent checks?
- What about bulk/batch/export/import operations — do they enforce per-item permissions?

For complex access models, split into separate agents for auth bypass vs authorization logic.

SUPPLY-CHAIN-AND-RELEASE.md#Untrusted code in a privileged workflow

**Untrusted code in a privileged workflow**
A pull request, issue comment, fork, dependency update, or external event runs contributor-controlled code with protected secrets, write tokens, deployment authority, or a trusted runner. Compare trigger type, checkout ref, approval gate, environment protection, and permission narrowing. Do not assume repository-host defaults that are not in source.

ATTACK-CLASSES.md#Injection

**Injection** (subagent_type: `general`)
Trace untrusted input from entry point to dangerous sink. What counts as a "dangerous sink" depends on the application:
- Web apps: SQL queries, HTML output, shell commands, template engines, file paths, HTTP redirects, deserialization
- Libraries: any function that processes caller-supplied data without validation — buffer operations, parsers, format strings
- CLI tools: shell command construction, file path handling, environment variable interpolation
- Services: query construction, message serialization, log injection, LDAP/XPATH queries
- Client-side (browser/JS): DOM XSS, prototype pollution, `postMessage`/origin trust, and other browser-side classes — covered by the [CLIENT-SIDE.md](CLIENT-SIDE.md) companion blocks when selected

Do not stop at the obvious direct paths. Look for indirect injection: data stored safely, then retrieved and used in a dangerous context by different code. Look for injection through field names, keys, headers, and metadata — not just values. Look for injection into secondary systems (logs, caches, search indexes, analytics).

SUPPLY-CHAIN-AND-RELEASE.md#Workflow command and expression confusion

**Workflow command and expression confusion**
Attacker-controlled branch names, commit messages, issue fields, artifact names, matrix values, or generated output enter shell commands, template expressions, paths, or privileged workflow inputs without canonical validation.

CLOUD-AND-DEPLOYMENT.md#Core discipline

## Core discipline (include in every agent prompt for this domain)

```
- Do not infer a live exposure from a manifest alone. Establish which environment consumes it, what defaults or overlays modify it, and whether the source path is active.
- Map each workload's identity to specific operations and resources. Broad policy is a finding only when lower-trust input can reach an unauthorized action.
- Ingress, proxies, service mesh, metadata services, and admission policy are real boundaries, but only count a control when its configuration and attachment are visible.
- Secret references are not secret disclosure. Require a lower-trust reader, output, artifact, log path, or unsafe fallback.
- Use `confirmed` for active in-repo configurations and local rendering/policy validation. Use `needs_validation` for account policy, network attachment, runtime admission, hosted metadata, or drift that needs owner observation.
```

CLOUD-AND-DEPLOYMENT.md#Security-control precedence drift

**Security-control precedence drift**
Development values, chart defaults, environment variables, command-line flags, feature gates, sidecar injection, or per-region overlays disable authentication, transport security, tenant scoping, or audit policy in a deployed environment. Render the final configuration for each maintained deployment, not just the base file.

CLOUD-AND-DEPLOYMENT.md#Universal moves

## Universal moves (apply across the above)

- Render every maintained environment and make a matrix of external port, workload identity, network peers, mounted secrets, and cloud resources. Differences require an owner or policy explanation.
- Follow a lower-trust request, object, label, or event into cloud policy. Show which workload credential performs the final operation and what condition should scope it.
- Diff normal deploy, migration, restore, node maintenance, failover, and local/emulator paths. Review behavior when mesh, admission, identity, secret, or policy service is unavailable.

CLOUD-AND-DEPLOYMENT.md#Validation rules

## Validation rules (apply before reporting ANY finding here)

1. Establish the active source path and effective deployment object; otherwise use `needs_validation` and state which rendered manifest or owner-observed attachment is missing.
2. Name the lower-trust caller/workload, cloud or application identity, controllable selector, affected resource, and unauthorized operation or disclosure.
3. Verify provider and orchestrator defaults at the pinned version. Do not assume a public IP, reachable metadata service, permissive firewall, or absent admission attachment.
4. Local validation may render templates, evaluate policy, inspect container/user namespaces in an isolated fixture, or run an emulator with dummy identities. Do not probe live endpoints or alter shared cloud resources.
5. Return `confirmed` only with a complete active source trace and concrete boundary result. Return `needs_validation` with the exact deployed policy, identity attachment, overlay, network, or drift observation needed.

CLOUD-AND-DEPLOYMENT.md#Unexpected service or management-plane reachability

**Unexpected service or management-plane reachability**
An ingress, service, listener, security group, load-balancer annotation, port mapping, or server bind exposes an admin, debug, metrics, node, control-plane, or internal API to a lower-trust network. Missing network controls alone are `needs_validation`; a repository-controlled public route to a sensitive handler can be `confirmed`.

CLOUD-AND-DEPLOYMENT.md#Host or control-plane capability exposure

**Host or control-plane capability exposure**
A lower-trust workload can select privileged mode, capabilities, host namespaces, host paths, device mounts, container runtime sockets, or service-account tokens that cross into node/control-plane authority. Bare absence of seccomp or read-only filesystem is hardening unless a reachable operation crosses that boundary.

SUPPLY-CHAIN-AND-RELEASE.md#Plugin and extension trust expansion

**Plugin and extension trust expansion**
An extension package gains host authority beyond its declared scope, a lower-trust publisher can replace another publisher's identity, or install/update hooks run before authenticity and capability checks. Intended installation of arbitrary same-user plugins is not a privilege boundary.

Explicit excluded blocks for this assignment:
[
  {
    "block": "WEB-PROTOCOL-AND-AUTH.md#SAML signed-object and assertion binding",
    "reason": "No SAML assertion consumer or XML identity route is registered in apps/api/src/app.module.ts or the package entry points."
  },
  {
    "block": "CLIENT-SIDE.md#DOM-based XSS",
    "reason": "The dashboard is a separate repository; the inspected product entry points serve API/MCP data and have no application DOM renderer."
  },
  {
    "block": "SUPPLY-CHAIN-AND-RELEASE.md#Update metadata and rollback confusion",
    "reason": "No application self-updater or signed-update consumer exists; GitHub draft publication is a separate assigned trust handoff."
  }
]

## Defensive vulnerability-finding method

Your goal is to find source-grounded security invariant failures and the smallest fix,
not to expand harm beyond the boundary result. Stay within source review and bounded local execution.
Do not contact deployed endpoints, provider APIs, registries, identity systems,
message brokers, shared services, or other users. Use local dummy data only.

READ THE CODE AT DEPTH. Follow each assigned input through parsing, identity,
authorization, normalization, state, derived copies, and the final sink. Read sibling,
legacy, batch, retry, cancellation, migration, and error paths that produce the same
effect. Compare sibling controls for equivalence, not only presence, and compare what
one component guarantees with what the next component assumes.

WORK FROM A CONCRETE INVARIANT:
1. Name the lower-trust principal and starting capability.
2. Name the accepted value, action, state transition, or resource selector.
3. Locate the control that should reject, bind, isolate, limit, or revoke it.
4. Trace the exact source path after that decision.
5. Stop at the smallest affected dummy record, wrong return value, process-integrity
   effect, or locally observable shared-resource effect.
6. State a source-level change and regression case that enforce the invariant.

DEPTH BOUND: trace only paths that can reach your assigned boundary or whose
guarantees that boundary relies on. Stop a line of investigation as soon as the
invariant is settled either way, and record the result in your structured output —
a covered, candidate, or blocked disposition, or an `uncovered` entry — instead of
continuing to search.

TEST SAD PATHS AND DISAGREEMENTS. Check absent, empty, zero, negative, maximum,
over-limit, duplicate, mixed encoding, stale, revoked, reordered, concurrent,
partially migrated, failed dependency, and rollback state only where the interface
accepts them. Compare canonicalization and units at every parser or policy handoff.
For multi-step issues, treat each output as a prerequisite and do not assume a later
boundary. If any prerequisite is not established, record a blocker.

When a proposed high or critical candidate reveals a reusable root cause, search paths
owned by the assigned coverage IDs for lexical, structural, and logical variants.
Consolidate the same root cause, but establish each variant's conditions and impact
independently. Do not investigate peer-owned units. Return a variant with no current
coverage unit as `uncovered`.

USE THE NARROWEST LOCAL CHECK THAT SETTLES THE CLAIM. Target-controlled builds,
tests, processes, browsers, emulators, fuzzers, and fixture processing may run only
inside the parent-approved OS-enforced sandbox. It must disable external networking,
start from an empty allowlisted environment, expose target and tools read-only, permit
writes only to your scratch directory, and apply low CPU, memory, process, file-size,
disk, and wall-clock limits. Isolated loopback is allowed only for a local fixture.
If any control is unavailable, do not execute: return needs_validation with that exact
blocker. Prefer an existing unit test, minimal function harness, dummy-tenant service
call, small malformed fixture, deterministic race schedule, or locally rendered policy.
Do not install or fetch tools.

Record the exact input, command, limits, and minimum result. For the environment,
record only allowlisted variable names and safe non-secret values needed to reproduce
the check. Never capture the ambient environment, inherited variables, credentials,
authentication state, or unrelated host paths. The target-controlled process writes
only in scratch. After the sandbox and all its processes terminate, only trusted
parent-side code may promote predeclared scratch-relative files, following the
promotion procedure block included verbatim in this prompt. You and target code never
write retained artifacts. If promotion is unavailable or fails for decisive evidence,
return needs_validation with the exact promotion blocker.
Never stress availability, invoke a live target, use a real credential, publish an
artifact, or continue past the minimum observed effect.

A deployment, browser, provider, broker, OS, proxy, package, secret, or identity fact
outside source is not proof either way. If one such fact is decisive, return a
needs_validation record with the exact missing observation and safe owner-observed check.

Artifact promotion procedure (trusted parent-side code only):
Reference only for you: the parent performs these steps; you never perform them.

Before execution, the parent opens and retains trusted, non-inheritable directory
descriptors for the agent's scratch/ and artifacts/ roots, and records an allowlist
of expected scratch-relative artifact files plus explicit per-file and cumulative
byte limits. Never pass those descriptors to the agent or sandbox. After the sandbox
and all its processes terminate, trusted parent-side code promotes each allowlisted
file separately:

1. Validate the declared relative path: reject absolute, empty, `.`, `..`, or
   symlinked components.
2. Walk each parent component from the retained scratch-root descriptor with
   no-follow directory-relative operations; never reopen by path.
3. Open the leaf no-follow and nonblocking.
4. Verify with `fstat` that it is a regular file with link count exactly one and
   within the recorded per-file and cumulative byte limits.
5. Enforce those limits again while reading from that descriptor.
6. Copy exactly the verified size, repeat `fstat`, and reject a changed identity,
   type, link count, or size.
7. For the destination, walk every parent component from the retained
   artifacts-root descriptor with no-follow directory-relative operations; require
   each existing component to be a real directory, and create any missing directory
   exclusively before reopening and verifying it no-follow.
8. Create the leaf exclusively without following links, verify that the opened
   destination is a regular file with link count exactly one, and copy from the
   verified source descriptor without reopening either path.
9. Use equivalent race-safe APIs on non-POSIX systems.
10. Never recursively copy or glob scratch, extract an archive into artifacts, or
    open or promote a symlink, FIFO, socket, device, directory, hard-linked file,
    changing file, or file that exceeds its bound.
11. If any check is unavailable, cannot be enforced, or fails, discard the scratch
    entry; if it is decisive evidence, retain `needs_validation` with the exact
    promotion blocker.

## Candidate gate

1. A candidate needs a complete repository-relative source trace and evidence for the
   claimed root cause, including the strongest source-visible control.
2. A proposed confirmed record needs a bounded local observed result, meaningful impact
   across a stated boundary, complete conditions, and no visible preventing layer.
3. Do not strengthen a crash into code execution, ordinary work into shared availability,
   or a same-principal action into privilege gain.
4. If a required fact is not source-visible or locally observable, use
   needs_validation. Name exact blockers; do not give it severity or speculative completion.
5. A missing best practice with no affected principal/resource is excluded or hardening,
   not a finding. A candidate disproved by source is not needs_validation.
6. Use the same source-derived fingerprint for the same root cause in every state.
   It must match `^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$` and must not include a line,
   wave, agent, severity, or verdict.
7. Return an empty candidate array when nothing survives these gates.

Prior confirmed exclusions: none. Peer-owned current IDs you must not duplicate:
[
  "apps%2Fapi%2Fprisma%2Fmigrations%23identity-and-architecture-migrations::apps%2Fapi%2Fsrc%2Finternal%2Fproject-grant.ts%23ProjectGrant::apps%2Fapi%2Fsrc%2Fwork-items::DATA-ISOLATION-AND-LIFECYCLE.md%23Migration%20default%20and%20ownership%20confusion",
  "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fcredentials.controller.ts%23CredentialsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fcredential.service.ts%23CredentialService::apps%2Fapi%2Fsrc%2Fauth::ATTACK-CLASSES.md%23Cryptography%20and%20secrets",
  "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fcredentials.controller.ts%23CredentialsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fcredential.service.ts%23CredentialService::apps%2Fapi%2Fsrc%2Fauth::DATA-ISOLATION-AND-LIFECYCLE.md%23Stale%20authorization%20and%20derived%20copy%20use",
  "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fcredentials.controller.ts%23CredentialsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fcredential.service.ts%23CredentialService::apps%2Fapi%2Fsrc%2Fauth::WEB-PROTOCOL-AND-AUTH.md%23API-key%20exposure%20and%20unsafe%20transport",
  "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fcredentials.controller.ts%23CredentialsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fcredential.service.ts%23CredentialService::apps%2Fapi%2Fsrc%2Fauth::WEB-PROTOCOL-AND-AUTH.md%23API-key%20scope%20and%20resource%20binding",
  "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fevents.controller.ts%23EventsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fevent-ingest.service.ts%23EventIngestService::apps%2Fapi%2Fsrc%2Fauth%2Fservices::ATTACK-CLASSES.md%23Access%20control",
  "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fevents.controller.ts%23EventsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fevent-ingest.service.ts%23EventIngestService::apps%2Fapi%2Fsrc%2Fauth%2Fservices::DATA-ISOLATION-AND-LIFECYCLE.md%23Analytics%2C%20logs%2C%20traces%2C%20and%20diagnostics%20as%20alternate%20readers",
  "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fevents.controller.ts%23EventsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fevent-ingest.service.ts%23EventIngestService::apps%2Fapi%2Fsrc%2Fauth%2Fservices::PROTOCOLS-RPC-AND-MESSAGING.md%23Untrusted%20producer%20treated%20as%20control%20plane",
  "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fevents.controller.ts%23EventsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fevent-ingest.service.ts%23EventIngestService::apps%2Fapi%2Fsrc%2Fauth%2Fservices::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Decompression%20and%20representation%20amplification",
  "apps%2Fapi%2Fsrc%2Fauth%2Fcontrollers%2Fsentry-events.controller.ts%23SentryEventsController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fevent-ingest.service.ts%23EventIngestService::apps%2Fapi%2Fsrc%2Fauth%2Fservices::PROTOCOLS-RPC-AND-MESSAGING.md%23Envelope%20and%20payload%20identity%20mismatch",
  "apps%2Fapi%2Fsrc%2Fconfig%2Fconfig.controller.ts%23ConfigController::apps%2Fapi%2Fsrc%2Fauth%2Fservices%2Fcredential.service.ts%23CredentialService::apps%2Fapi%2Fsrc%2Fauth::DATA-ISOLATION-AND-LIFECYCLE.md%23Export%20and%20backup%20scope%20expansion",
  "apps%2Fapi%2Fsrc%2Fidentity%2Fcontrollers%2Faccount.controller.ts%23AccountController::apps%2Fapi%2Fsrc%2Fidentity%2Fguards%2Faccount-auth.guard.ts%23AccountAuthGuard::apps%2Fapi%2Fsrc%2Fidentity::ATTACK-CLASSES.md%23Access%20control",
  "apps%2Fapi%2Fsrc%2Fidentity%2Fcontrollers%2Faccount.controller.ts%23AccountController::apps%2Fapi%2Fsrc%2Fidentity%2Fguards%2Faccount-auth.guard.ts%23AccountAuthGuard::apps%2Fapi%2Fsrc%2Fidentity::ATTACK-CLASSES.md%23Business%20logic",
  "apps%2Fapi%2Fsrc%2Fidentity%2Fcontrollers%2Faccount.controller.ts%23AccountController::apps%2Fapi%2Fsrc%2Fidentity%2Fguards%2Faccount-auth.guard.ts%23AccountAuthGuard::apps%2Fapi%2Fsrc%2Fidentity::DATA-ISOLATION-AND-LIFECYCLE.md%23Missing%20tenant%20or%20owner%20enforcement",
  "apps%2Fapi%2Fsrc%2Fidentity%2Fcontrollers%2Faccount.controller.ts%23AccountController::apps%2Fapi%2Fsrc%2Fidentity%2Fguards%2Faccount-auth.guard.ts%23AccountAuthGuard::apps%2Fapi%2Fsrc%2Fidentity::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Pre-authentication%20work%20imbalance",
  "apps%2Fapi%2Fsrc%2Fidentity%2Fcontrollers%2Faccount.controller.ts%23AccountController::apps%2Fapi%2Fsrc%2Fidentity%2Fguards%2Faccount-auth.guard.ts%23AccountAuthGuard::apps%2Fapi%2Fsrc%2Fidentity::WEB-PROTOCOL-AND-AUTH.md%23JWT%20verification%20and%20claim%20binding",
  "apps%2Fapi%2Fsrc%2Fidentity%2Fcontrollers%2Faccount.controller.ts%23AccountController::apps%2Fapi%2Fsrc%2Fidentity%2Fguards%2Faccount-auth.guard.ts%23AccountAuthGuard::apps%2Fapi%2Fsrc%2Fidentity::WEB-PROTOCOL-AND-AUTH.md%23Session%20fixation%20and%20invalidation",
  "apps%2Fapi%2Fsrc%2Fmcp%2Fmcp.module.ts%23GraveshiftMcpModule::apps%2Fapi%2Fsrc%2Fmcp%2Fmcp-token.verifier.ts%23McpBearerGuard::apps%2Fapi%2Fsrc%2Fmcp::AI-AND-LLM.md%23Tool-schema%20and%20dispatcher%20disagreement",
  "apps%2Fapi%2Fsrc%2Fmcp%2Fmcp.module.ts%23GraveshiftMcpModule::apps%2Fapi%2Fsrc%2Fmcp%2Fmcp-token.verifier.ts%23McpBearerGuard::apps%2Fapi%2Fsrc%2Fmcp::ATTACK-CLASSES.md%23Feature%20abuse%20and%20data%20leakage",
  "apps%2Fapi%2Fsrc%2Fmcp%2Fmcp.module.ts%23GraveshiftMcpModule::apps%2Fapi%2Fsrc%2Fmcp%2Fmcp-token.verifier.ts%23McpBearerGuard::apps%2Fapi%2Fsrc%2Fmcp::DATA-ISOLATION-AND-LIFECYCLE.md%23Missing%20tenant%20or%20owner%20enforcement",
  "apps%2Fapi%2Fsrc%2Fmcp%2Fmcp.module.ts%23GraveshiftMcpModule::apps%2Fapi%2Fsrc%2Fmcp%2Fmcp-token.verifier.ts%23McpBearerGuard::apps%2Fapi%2Fsrc%2Fmcp::PROTOCOLS-RPC-AND-MESSAGING.md%23Interceptor%20and%20method-path%20inconsistency",
  "apps%2Fapi%2Fsrc%2Fwork-items%2Fcontrollers%2Fwork-items.controller.ts%23WorkItemsController::apps%2Fapi%2Fsrc%2Finternal%2Fproject-grant.ts%23ProjectGrant::apps%2Fapi%2Fsrc%2Fwork-items::ATTACK-CLASSES.md%23Access%20control",
  "apps%2Fapi%2Fsrc%2Fwork-items%2Fcontrollers%2Fwork-items.controller.ts%23WorkItemsController::apps%2Fapi%2Fsrc%2Finternal%2Fproject-grant.ts%23ProjectGrant::apps%2Fapi%2Fsrc%2Fwork-items::DATA-ISOLATION-AND-LIFECYCLE.md%23Composite-key%20and%20namespace%20collision",
  "apps%2Fapi%2Fsrc%2Fwork-items%2Fcontrollers%2Fwork-items.controller.ts%23WorkItemsController::apps%2Fapi%2Fsrc%2Finternal%2Fproject-grant.ts%23ProjectGrant::apps%2Fapi%2Fsrc%2Fwork-items::DATA-ISOLATION-AND-LIFECYCLE.md%23Missing%20tenant%20or%20owner%20enforcement",
  "apps%2Fapi%2Fsrc%2Fwork-items%2Fcontrollers%2Fwork-items.controller.ts%23WorkItemsController::apps%2Fapi%2Fsrc%2Finternal%2Fproject-grant.ts%23ProjectGrant::apps%2Fapi%2Fsrc%2Fwork-items::PROTOCOLS-RPC-AND-MESSAGING.md%23Acknowledgment%2Fcommit%20ordering%20defects",
  "apps%2Fapi%2Fsrc%2Fwork-items%2Fcontrollers%2Fwork-items.controller.ts%23WorkItemsController::apps%2Fapi%2Fsrc%2Finternal%2Fproject-grant.ts%23ProjectGrant::apps%2Fapi%2Fsrc%2Fwork-items::PROTOCOLS-RPC-AND-MESSAGING.md%23Duplicate%20delivery%20and%20idempotency%20gaps",
  "apps%2Fapi%2Fsrc%2Fwork-items%2Fcontrollers%2Fwork-items.controller.ts%23WorkItemsController::apps%2Fapi%2Fsrc%2Finternal%2Fproject-grant.ts%23ProjectGrant::apps%2Fapi%2Fsrc%2Fwork-items::PROTOCOLS-RPC-AND-MESSAGING.md%23Out-of-order%20and%20stale%20message%20acceptance",
  "apps%2Fdaemon%2Fsrc%2Ffix-execution.ts%23executorFromEnv::packages%2Ffixer%2Fsrc%2Fverify.ts%23verifyPatch::packages%2Ffixer::AI-AND-LLM.md%23Tool-argument%20injection%20into%20a%20downstream%20sink",
  "apps%2Fdaemon%2Fsrc%2Ffix-execution.ts%23executorFromEnv::packages%2Ffixer%2Fsrc%2Fverify.ts%23verifyPatch::packages%2Ffixer::ATTACK-CLASSES.md%23Business%20logic",
  "apps%2Fdaemon%2Fsrc%2Ffix-execution.ts%23executorFromEnv::packages%2Ffixer%2Fsrc%2Fverify.ts%23verifyPatch::packages%2Ffixer::ATTACK-CLASSES.md%23Resource%20and%20file%20handling",
  "apps%2Fdaemon%2Fsrc%2Ffix-execution.ts%23executorFromEnv::packages%2Ffixer%2Fsrc%2Fverify.ts%23verifyPatch::packages%2Ffixer::DESKTOP-MOBILE-AND-LOCAL-IPC.md%23Local%20file%20ownership%20and%20TOCTOU",
  "apps%2Fdaemon%2Fsrc%2Ffix-execution.ts%23executorFromEnv::packages%2Ffixer%2Fsrc%2Fverify.ts%23verifyPatch::packages%2Ffixer::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Worker%2C%20pool%2C%20and%20priority%20starvation",
  "apps%2Fdaemon%2Fsrc%2Ffix-execution.ts%23executorFromEnv::packages%2Ffixer%2Fsrc%2Fverify.ts%23verifyPatch::packages%2Ffixer::SUPPLY-CHAIN-AND-RELEASE.md%23Build-to-promotion%20substitution",
  "apps%2Fdaemon%2Fsrc%2Ffix-execution.ts%23executorFromEnv::packages%2Ffixer%2Fsrc%2Fverify.ts%23verifyPatch::packages%2Ffixer::SUPPLY-CHAIN-AND-RELEASE.md%23Untrusted%20code%20in%20a%20privileged%20workflow",
  "apps%2Fdaemon%2Fsrc%2Fmain.ts%23privateHandler::apps%2Fapi%2Fsrc%2Fmcp%2Fmcp-token.verifier.ts%23McpBearerGuard::apps%2Fapi%2Fsrc%2Fmcp::DESKTOP-MOBILE-AND-LOCAL-IPC.md%23IPC%20peer-authentication%20gaps",
  "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::AI-AND-LLM.md%23Action-confirmation%20and%20approval%20binding",
  "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::AI-AND-LLM.md%23Indirect%20injection%20through%20retrieved%20or%20ingested%20content",
  "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::AI-AND-LLM.md%23Sensitive%20context%20extraction",
  "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::AI-AND-LLM.md%23Tool-schema%20and%20dispatcher%20disagreement",
  "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::AI-AND-LLM.md%23Unbounded%20delegated%20action%20loops",
  "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::ATTACK-CLASSES.md%23Business%20logic",
  "apps%2Fdaemon%2Fsrc%2Frouting-model.ts%23routingModel::packages%2Fgateway%2Fsrc%2Fgateway.ts%23createGateway::packages%2Fgateway::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Detached%20work%20after%20cancellation",
  "package.json%23workspaces::apps%2Fapi%2Fsrc%2Fapp.factory.ts%23createApp::package.json%23workspaces::ATTACK-CLASSES.md%23Obvious%20things",
  "package.json%23workspaces::apps%2Fapi%2Fsrc%2Fapp.factory.ts%23createApp::package.json%23workspaces::ATTACK-CLASSES.md%23Wildcard",
  "packages%2Factuator%2Fsrc%2Fhandler.ts%23createActionHandler::packages%2Factuator%2Fsrc%2Fexecute.ts%23createActuator::packages%2Factuator::AI-AND-LLM.md%23Action-confirmation%20and%20approval%20binding",
  "packages%2Factuator%2Fsrc%2Fhandler.ts%23createActionHandler::packages%2Factuator%2Fsrc%2Fexecute.ts%23createActuator::packages%2Factuator::ATTACK-CLASSES.md%23Cryptography%20and%20secrets",
  "packages%2Factuator%2Fsrc%2Fhandler.ts%23createActionHandler::packages%2Factuator%2Fsrc%2Fexecute.ts%23createActuator::packages%2Factuator::ATTACK-CLASSES.md%23Injection",
  "packages%2Factuator%2Fsrc%2Fhandler.ts%23createActionHandler::packages%2Factuator%2Fsrc%2Fexecute.ts%23createActuator::packages%2Factuator::CLOUD-AND-DEPLOYMENT.md%23Namespace%20and%20label%20trust%20confusion",
  "packages%2Factuator%2Fsrc%2Fhandler.ts%23createActionHandler::packages%2Factuator%2Fsrc%2Fexecute.ts%23createActuator::packages%2Factuator::PROTOCOLS-RPC-AND-MESSAGING.md%23Duplicate%20delivery%20and%20idempotency%20gaps",
  "packages%2Fevents%2Fsrc%2Fconsumer.ts%23connectEventsConsumer::packages%2Fevents%2Fsrc%2Fconsumer.ts%23processQueued::packages%2Fevents::ATTACK-CLASSES.md%23Resource%20and%20file%20handling",
  "packages%2Fevents%2Fsrc%2Fconsumer.ts%23connectEventsConsumer::packages%2Fevents%2Fsrc%2Fconsumer.ts%23processQueued::packages%2Fevents::CLOUD-AND-DEPLOYMENT.md%23Namespace%20and%20label%20trust%20confusion",
  "packages%2Fevents%2Fsrc%2Fconsumer.ts%23connectEventsConsumer::packages%2Fevents%2Fsrc%2Fconsumer.ts%23processQueued::packages%2Fevents::PROTOCOLS-RPC-AND-MESSAGING.md%23Duplicate%20delivery%20and%20idempotency%20gaps",
  "packages%2Fevents%2Fsrc%2Fconsumer.ts%23connectEventsConsumer::packages%2Fevents%2Fsrc%2Fconsumer.ts%23processQueued::packages%2Fevents::PROTOCOLS-RPC-AND-MESSAGING.md%23Topic%2C%20routing-key%2C%20and%20subscription%20scope%20gaps",
  "packages%2Fevents%2Fsrc%2Fconsumer.ts%23connectEventsConsumer::packages%2Fevents%2Fsrc%2Fconsumer.ts%23processQueued::packages%2Fevents::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Poison-record%20and%20head-of-line%20blocking",
  "packages%2Fevents%2Fsrc%2Fconsumer.ts%23connectEventsConsumer::packages%2Fevents%2Fsrc%2Fconsumer.ts%23processQueued::packages%2Fevents::RESOURCE-EXHAUSTION-AND-AVAILABILITY.md%23Unbounded%20buffering%20and%20cardinality",
  "packages%2Fmcp-client%2Fsrc%2Fclient.ts%23createGraveshiftMcp::apps%2Fapi%2Fsrc%2Fmcp%2Fmcp-token.verifier.ts%23McpBearerGuard::apps%2Fapi%2Fsrc%2Fmcp::AI-AND-LLM.md%23MCP%20server%20and%20tool%20identity%20confusion"
]

Your unique scratch: /Users/xirothedev/security-audit-skill/graveshift/run-1/agents/hunt-supply-deploy/scratch/
Parent-owned artifacts: /Users/xirothedev/security-audit-skill/graveshift/run-1/agents/hunt-supply-deploy/artifacts/
Promotion allowlist: []
Per-file and cumulative promoted-artifact limit: 0 bytes. You may save the source-only structured result JSON to /Users/xirothedev/security-audit-skill/graveshift/run-1/agents/hunt-supply-deploy/scratch/source-result.json for parent parsing, and return the same complete JSON in your response. That file is a message copy, not local-execution evidence, and must never be cited as an artifact. Do not write anywhere else. All target-controlled execution is blocked because no complete memory and cumulative disk sandbox controls are established. Use source-only checks, method source, artifact null. A candidate needing behavioral proof must be needs_validation and explain that exact blocker; do not fabricate an observed result. Never invoke project code, test runners, package scripts, containers, or external services. Never read ignored local env, credential or MCP-settings files. Cite secret-bearing source locations without copying a real secret value.


Return exactly one JSON object, with no surrounding prose:

```json
{
  "units": [
    {
      "coverage_id": "one assigned ID",
      "disposition": "covered|candidate|blocked",
      "reviewed_paths": ["repo/relative/path"],
      "checks": [
        {
          "agent_id": "canonical owner of this check",
          "reviewed_paths": ["repo/relative/path owned by this check"],
          "invariant": "specific control checked for this unit",
          "method": "source|local",
          "result": "what source or the bounded check established",
          "artifact": "agents/<agent-id>/artifacts/file for local, null for source"
        }
      ],
      "candidate_fingerprints": [],
      "unresolved": []
    }
  ],
  "candidates": [],
  "hardening": ["concrete non-finding note"],
  "uncovered": [
    {
      "surface": "...",
      "boundary": "...",
      "subsystem": "...",
      "attack_class": "...",
      "starting_paths": ["repo/relative/path"],
      "reason": "why this needs its own deterministic coverage unit"
    }
  ]
}
```

Each `candidates` entry is schema-shaped except that it uses `proposed_verdict` in place of `verdict`:

- `proposed_verdict: "confirmed"`: include every field required by the `confirmed` branch of `report-schema.json` other than `verdict`: `fingerprint`, title, description, `root_cause`, `intended_behavior`, ordered `trace`, `evidence`, `conditions`, target-neutral `execution`, `remediation`, `severity`, and `confidence`. The execution instructions describe only the bounded local check already performed. `payloads` holds the minimum test input, fixture, or native invocation. `observed_result` records actual local output. Overall severity must not exceed observed impact.
- `proposed_verdict: "needs_validation"`: include every field required by that schema branch other than `verdict`: `fingerprint`, title, description, `claimed_root_cause`, ordered `trace`, `evidence`, nonempty `blockers`, and `validation_plan` with at least one applicable `local` or `deployment` step. Do not invent an inapplicable context. Do not include severity, execution, remediation, reason, or a confirmed `root_cause`. `deployment` is an owner-observed check, not a request to probe a live target.

Every assigned coverage ID appears exactly once in `units`. A `covered` unit needs an owner, nonempty `reviewed_paths` and `checks`, no unresolved fact, and no candidate. A `candidate` unit has the same owned evidence and is the only state that carries linked fingerprints. A `blocked` unit is an owned partial review with nonempty paths, checks, and unresolved facts but no fingerprint. All source paths are repository-relative, never absolute or traversal paths. A trace with several entries begins at `entrypoint`, ends at `sink`, and labels intermediate steps `propagation`. Every check has its own canonical lowercase `agent_id` and nonempty `reviewed_paths`; the unit-level list is exactly the union of those owned paths. A `source` check uses `artifact: null`. A `local` check uses one successfully parent-promoted regular file beneath `agents/<check.agent_id>/artifacts/`; this permits a verifier to add independently owned evidence without taking ownership from the hunter. Never link scratch, an output-root file, or another check owner's artifact.



Full report schema, including the confirmed and needs_validation branches copied verbatim:
{
  "$comment": "Top-level contract for findings.json. validate-findings.cjs interprets and checks this schema directly.",
  "type": "array",
  "items": {
    "oneOf": [
      {
        "type": "object",
        "description": "A source-grounded vulnerability that was independently demonstrated.",
        "properties": {
          "verdict": {
            "type": "string",
            "const": "confirmed"
          },
          "fingerprint": {
            "type": "string",
            "minLength": 1,
            "pattern": "^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$",
            "description": "A stable source-derived identifier that does not change between validation states."
          },
          "title": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "description": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "root_cause": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "intended_behavior": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "trace": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": ["entrypoint", "propagation", "sink"]
                },
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "scope": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["kind", "file", "line", "scope", "description"],
              "additionalProperties": false
            }
          },
          "evidence": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["file", "line", "description"],
              "additionalProperties": false
            }
          },
          "conditions": {
            "type": "array",
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": ["authentication_level", "authorization_role", "user_interaction", "system_configuration", "network_routing", "environmental_dependency", "data_state", "timing_dependency", "third_party_dependency"]
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["kind", "description"],
              "additionalProperties": false
            }
          },
          "execution": {
            "type": "object",
            "description": "Target-neutral reproduction in the target's native interface.",
            "properties": {
              "attacker_perspective": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              },
              "payloads": {
                "type": "array",
                "minItems": 1,
                "uniqueItems": true,
                "items": {
                  "type": "string"
                }
              },
              "instructions": {
                "type": "array",
                "minItems": 1,
                "items": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "observed_result": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              }
            },
            "required": ["attacker_perspective", "payloads", "instructions", "observed_result"],
            "additionalProperties": false
          },
          "remediation": {
            "type": "object",
            "properties": {
              "strategy": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              },
              "code_changes": {
                "type": "array",
                "items": {
                  "type": "object",
                  "properties": {
                    "file_name": {
                      "type": "string",
                      "minLength": 1
                    },
                    "fixed_code": {
                      "type": "string"
                    }
                  },
                  "required": ["file_name", "fixed_code"],
                  "additionalProperties": false
                }
              }
            },
            "required": ["strategy"],
            "additionalProperties": false
          },
          "severity": {
            "type": "object",
            "properties": {
              "likelihood": {
                "type": "object",
                "properties": {
                  "score": {
                    "type": "string",
                    "enum": ["informational", "low", "medium", "high", "critical"]
                  },
                  "reason": {
                    "type": "string",
                    "minLength": 1,
                    "visibleContent": true
                  }
                },
                "required": ["score", "reason"],
                "additionalProperties": false
              },
              "impact": {
                "type": "object",
                "properties": {
                  "score": {
                    "type": "string",
                    "enum": ["informational", "low", "medium", "high", "critical"]
                  },
                  "reason": {
                    "type": "string",
                    "minLength": 1,
                    "visibleContent": true
                  }
                },
                "required": ["score", "reason"],
                "additionalProperties": false
              },
              "overall_severity": {
                "type": "string",
                "enum": ["informational", "low", "medium", "high", "critical"]
              }
            },
            "required": ["likelihood", "impact", "overall_severity"],
            "additionalProperties": false
          },
          "confidence": {
            "type": "object",
            "properties": {
              "score": {
                "type": "string",
                "enum": ["low", "medium", "high"]
              },
              "reason": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              }
            },
            "required": ["score", "reason"],
            "additionalProperties": false
          }
        },
        "required": ["verdict", "fingerprint", "title", "description", "root_cause", "intended_behavior", "trace", "evidence", "conditions", "execution", "remediation", "severity", "confidence"],
        "additionalProperties": false
      },
      {
        "type": "object",
        "description": "A source-grounded candidate whose decisive validation is blocked.",
        "properties": {
          "verdict": {
            "type": "string",
            "const": "needs_validation"
          },
          "fingerprint": {
            "type": "string",
            "minLength": 1,
            "pattern": "^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$"
          },
          "title": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "description": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "claimed_root_cause": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "trace": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": ["entrypoint", "propagation", "sink"]
                },
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "scope": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["kind", "file", "line", "scope", "description"],
              "additionalProperties": false
            }
          },
          "evidence": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["file", "line", "description"],
              "additionalProperties": false
            }
          },
          "blockers": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "string",
              "minLength": 1,
              "visibleContent": true
            }
          },
          "validation_plan": {
            "type": "object",
            "properties": {
              "local": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              },
              "deployment": {
                "type": "string",
                "minLength": 1,
                "visibleContent": true
              }
            },
            "additionalProperties": false
          }
        },
        "required": ["verdict", "fingerprint", "title", "description", "claimed_root_cause", "trace", "evidence", "blockers", "validation_plan"],
        "additionalProperties": false
      },
      {
        "type": "object",
        "description": "A source-grounded candidate refuted during validation.",
        "properties": {
          "verdict": {
            "type": "string",
            "const": "rejected"
          },
          "fingerprint": {
            "type": "string",
            "minLength": 1,
            "pattern": "^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$"
          },
          "title": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "description": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "claimed_root_cause": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          },
          "trace": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "kind": {
                  "type": "string",
                  "enum": ["entrypoint", "propagation", "sink"]
                },
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "scope": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["kind", "file", "line", "scope", "description"],
              "additionalProperties": false
            }
          },
          "evidence": {
            "type": "array",
            "minItems": 1,
            "uniqueItems": true,
            "items": {
              "type": "object",
              "properties": {
                "file": {
                  "type": "string",
                  "minLength": 1
                },
                "line": {
                  "type": "integer",
                  "minimum": 1
                },
                "description": {
                  "type": "string",
                  "minLength": 1,
                  "visibleContent": true
                }
              },
              "required": ["file", "line", "description"],
              "additionalProperties": false
            }
          },
          "reason": {
            "type": "string",
            "minLength": 1,
            "visibleContent": true
          }
        },
        "required": ["verdict", "fingerprint", "title", "description", "claimed_root_cause", "trace", "evidence", "reason"],
        "additionalProperties": false
      }
    ]
  }
}
