You are a fresh independent verifier confirm-08 of a newly confirmed finding. Verify the record and its bounded local evidence from source; do not merely accept the harness claim.

Target: /Users/xirothedev/workspace/graveshift
Agent ID: confirm-08
Do not execute project code, tests, builds, or network requests. Do not read ignored secrets/local settings. Do not edit target source or shared audit files.

Confirmed record under review:
{
  "fingerprint": "fixer/recovery/parent-only-publication-binding",
  "title": "Publication recovery can accept a same-parent head with unverified content",
  "description": "A repository actor able to rewrite a generated bot branch can replace its head with a different tree whose sole parent is the admitted Deployment SHA. If the draft is still open and the attempt needs reconciliation, recovery checks the current PR head against the current ref and original parent, then records that draft as the completed Fix. It never compares the remote tree to the verified patch. The branch name includes verified hashes, but a writer can retain that name while changing its content. The affected boundary is Graveshift's verification/result authority: the claimed effect is acceptance of an unverified draft head, not GitHub write privilege gain for a writer, automatic merge, or release execution. Branch permissions and a bounded acceptance result remain unvalidated.",
  "trace": [
    {
      "kind": "entrypoint",
      "file": "apps/daemon/src/recovery.ts",
      "line": 43,
      "scope": "reconcile",
      "description": "An authenticated replay of an uncertain publication parses the persisted intent containing repo, branch and baseSha, with no expected result tree or head. The lower-trust input is the current remote branch/PR state a repository writer can have replaced."
    },
    {
      "kind": "propagation",
      "file": "packages/fixer/src/verified-publication.ts",
      "line": 34,
      "scope": "recoverPublication",
      "description": "Recovery forwards only the recorded repository, mutable branch name and base SHA to the GitHub client and checks the returned repository/branch."
    },
    {
      "kind": "propagation",
      "file": "packages/fixer/src/rest.ts",
      "line": 140,
      "scope": "getExistingDraft",
      "description": "The client requires a unique open draft with the exact head ref in the same repository, preventing fork/ref confusion but not modification of the named branch."
    },
    {
      "kind": "propagation",
      "file": "packages/fixer/src/rest.ts",
      "line": 156,
      "scope": "getExistingDraft head validation",
      "description": "It reads the remote commit's SHA and parents plus the current ref. The schema omits tree identity; acceptance requires only matching current head/ref and one parent equal to the recorded base. A different tree with that parent satisfies these checks."
    },
    {
      "kind": "propagation",
      "file": "apps/daemon/src/recovery.ts",
      "line": 60,
      "scope": "reconcile recordPublication",
      "description": "The returned head reference is recorded under the original attempt and base. API recordPublication checks intent repository/branch/base and known-reference equality, not the verified tree."
    },
    {
      "kind": "sink",
      "file": "apps/daemon/src/recovery.ts",
      "line": 64,
      "scope": "reconcile completion",
      "description": "The Work attempt is finished as completed with ok:true and the recovered head, without rerunning source verification. The minimal result to validate is recording a harmless substituted tree as the verified Fix."
    }
  ],
  "evidence": [
    {
      "file": "packages/fixer/src/verified-publication.ts",
      "line": 19,
      "description": "planPublication validates the local receipt but returns only repository, deterministic branch and original base SHA."
    },
    {
      "file": "packages/fixer/src/open-pr.ts",
      "line": 41,
      "description": "Snapshot and patch hashes influence the branch name; they are not independently recovered from remote content."
    },
    {
      "file": "packages/work/src/state.ts",
      "line": 19,
      "description": "The durable PublicationIntent schema has no expected head, expected tree or verified content digest."
    },
    {
      "file": "packages/fixer/src/rest.ts",
      "line": 168,
      "description": "The strongest remote check verifies PR head/ref consistency and a single parent equal to baseSha, with no content-identity comparison."
    },
    {
      "file": "packages/fixer/src/verified-publication.ts",
      "line": 62,
      "description": "The normal publication path also returns a recovered existing draft immediately, without creating the verified content again or checking its remote tree."
    },
    {
      "file": "apps/api/src/work-items/work-item.publication.ts",
      "line": 71,
      "description": "The durable consumer checks repository/branch/base equality and fences state, but accepts the first recovered head because the intent has no expected content identity."
    },
    {
      "file": "packages/fixer/src/source-rest.test.ts",
      "line": 152,
      "description": "Source tests exercise wrong base, merge/root commits, moved refs and mismatched heads; no same-parent/different-tree binding is represented. These tests were not executed."
    }
  ],
  "verdict": "confirmed",
  "root_cause": "The immutable object identity is lost when planPublication reduces the receipt to repo/branch/baseSha and PublicationIntent persists only those fields. getExistingDraft binds the current head/ref to the base parent but does not bind its tree or head digest to the original verified result. Both existing-draft reuse and uncertain-effect reconciliation trust this weaker identity.",
  "intended_behavior": "Draft recovery must verify the same immutable content identity that was originally verified.",
  "conditions": [
    {
      "kind": "system_configuration",
      "description": "The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace."
    }
  ],
  "execution": {
    "attacker_perspective": "Holder of the lower-trust capability described in the title.",
    "payloads": [
      "{\"plan\":{\"repo\":\"acme/widgets\",\"branch\":\"refs/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue\",\"baseSha\":\"base-1111111111111111111111111111111111111111\"},\"planKeys\":[\"baseSha\",\"branch\",\"repo\"],\"planCarriesExpectedTree\":false,\"baseSha\":\"base-1111111111111111111111111111111111111111\",\"verifiedTree\":\"tree-verified-2222222222222222222222222222222222222222\",\"substitutedTree\":\"tree-substituted-33333333333333333333333333333333333333\",\"treesDiffer\":true,\"bothCommitsShareSingleParent\":true,\"draftHeadSha\":\"commit-substituted-55555555555555555555555555555555555555\",\"returnedByGetExistingDraft\":{\"repo\":\"acme/widgets\",\"branch\":\"refs/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue\",\"number\":7,\"url\":\"https://github.com/acme/widgets/pull/7\",\"headSha\":\"commit-substituted-55555555555555555555555555555555555555\"},\"returnedByRecoverPublication\":{\"repo\":\"acme/widgets\",\"branch\":\"refs/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue\",\"number\":7,\"url\":\"https://github.com/acme/widgets/pull/7\",\"headSha\":\"commit-substituted-55555555555555555555555555555555555555\"},\"headShaAccepted\":true,\"transportCalls\":[\"GET /repos/acme/widgets/git/commits/commit-verified-4444444444444444444444444444444444444444\",\"GET /repos/acme/widgets/git/commits/commit-substituted-55555555555555555555555555555555555555\",\"GET /repos/acme/widgets/pulls?state=open&head=acme%3Afixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue&per_page=2\",\"GET /repos/acme/widgets/git/commits/commit-substituted-55555555555555555555555555555555555555\",\"GET /repos/acme/widgets/git/ref/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue\",\"GET /repos/acme/widgets/pulls?state=open&head=acme%3Afixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue&per_page=2\",\"GET /repos/acme/widgets/git/commits/commit-substituted-55555555555555555555555555555555555555\",\"GET /repos/acme/widgets/git/ref/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue\"],\"s"
    ],
    "instructions": [
      "Run 08-publication-recovery.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result."
    ],
    "observed_result": "The substituted head was accepted by both getExistingDraft and the real recoverPublication wrapper. getExistingDraft (rest.ts:140-183) validates only that the draft head sha matches the ref and that the head commit has exactly one parent equal to baseSha (rest.ts:168-175); it never reads the commit tree or compares it to the originally verified tree digest. The persisted PublicationPlan (verified-publication.ts:8-12) contains only repo/branch/baseSha, so no expected-tree binding is possible. Two distinct trees with the same single parent are therefore interchangeable at recovery time."
  },
  "remediation": {
    "strategy": "Persist an expected tree/head digest in PublicationIntent and reject an existing draft whose head tree differs, including on replay reconciliation."
  },
  "severity": {
    "likelihood": {
      "score": "medium",
      "reason": "Requires an actor able to rewrite the generated branch."
    },
    "impact": {
      "score": "medium",
      "reason": "Records an unverified head as the completed Fix."
    },
    "overall_severity": "medium"
  },
  "confidence": {
    "score": "high",
    "reason": "The minimum boundary result was observed in a compliant container with dummy data."
  }
}

Observed bounded result from the compliant container:
{
  "lead": "fixer/recovery/parent-only-publication-binding",
  "verdict": "confirmed",
  "observed": {
    "plan": {
      "repo": "acme/widgets",
      "branch": "refs/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue",
      "baseSha": "base-1111111111111111111111111111111111111111"
    },
    "planKeys": [
      "baseSha",
      "branch",
      "repo"
    ],
    "planCarriesExpectedTree": false,
    "baseSha": "base-1111111111111111111111111111111111111111",
    "verifiedTree": "tree-verified-2222222222222222222222222222222222222222",
    "substitutedTree": "tree-substituted-33333333333333333333333333333333333333",
    "treesDiffer": true,
    "bothCommitsShareSingleParent": true,
    "draftHeadSha": "commit-substituted-55555555555555555555555555555555555555",
    "returnedByGetExistingDraft": {
      "repo": "acme/widgets",
      "branch": "refs/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue",
      "number": 7,
      "url": "https://github.com/acme/widgets/pull/7",
      "headSha": "commit-substituted-55555555555555555555555555555555555555"
    },
    "returnedByRecoverPublication": {
      "repo": "acme/widgets",
      "branch": "refs/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue",
      "number": 7,
      "url": "https://github.com/acme/widgets/pull/7",
      "headSha": "commit-substituted-55555555555555555555555555555555555555"
    },
    "headShaAccepted": true,
    "transportCalls": [
      "GET /repos/acme/widgets/git/commits/commit-verified-4444444444444444444444444444444444444444",
      "GET /repos/acme/widgets/git/commits/commit-substituted-55555555555555555555555555555555555555",
      "GET /repos/acme/widgets/pulls?state=open&head=acme%3Afixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue&per_page=2",
      "GET /repos/acme/widgets/git/commits/commit-substituted-55555555555555555555555555555555555555",
      "GET /repos/acme/widgets/git/ref/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue",
      "GET /repos/acme/widgets/pulls?state=open&head=acme%3Afixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue&per_page=2",
      "GET /repos/acme/widgets/git/commits/commit-substituted-55555555555555555555555555555555555555",
      "GET /repos/acme/widgets/git/ref/heads/fixer-inc-0123456789abcdef0123456789abcdef-fix-security-issue"
    ],
    "sourceLines": [
      "packages/fixer/src/rest.ts:140-183 (getExistingDraft: parent-only checks at 168-175, no tree check)",
      "packages/fixer/src/verified-publication.ts:8-12 (PublicationPlan = repo/branch/baseSha only)",
      "packages/fixer/src/verified-publication.ts:29-41 (recoverPublication calls getExistingDraft with those three fields)"
    ]
  },
  "reason": "The substituted head was accepted by both getExistingDraft and the real recoverPublication wrapper. getExistingDraft (rest.ts:140-183) validates only that the draft head sha matches the ref and that the head commit has exactly one parent equal to baseSha (rest.ts:168-175); it never reads the commit tree or compares it to the originally verified tree digest. The persisted PublicationPlan (verified-publication.ts:8-12) contains only repo/branch/baseSha, so no expected-tree binding is possible. Two distinct trees with the same single parent are therefore interchangeable at recovery time."
}


Harness source: /Users/xirothedev/security-audit-skill/graveshift/run-1/validation/08-publication-recovery.ts. Read it. Container controls are in /Users/xirothedev/security-audit-skill/graveshift/run-1/validation/run-check.sh and /Users/xirothedev/security-audit-skill/graveshift/run-1/validation/CONTRACT.md; read both and confirm the harness used only dummy data, no network, read-only target, scratch-only bounded writes, 512 MiB memory, 1 CPU, 64 pids, and a hard timeout.

Report schema (confirmed branch) copied verbatim:
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


Check every repository-relative trace/evidence path, line, scope and described operation; confirm the entry point is a real lower-trust principal, the last item is the claimed sink, and the observed result proves that exact invariant. Check that likelihood, impact and overall severity do not exceed the demonstrated dummy-data result, and that remediation enforces the invariant at the named decision point. A source/error correction that does not change verdict, result, impact or severity may be returned as a replace record. If the evidence does not support confirmation, return rejected with a reason.

Save your exact JSON to /Users/xirothedev/security-audit-skill/graveshift/run-1/agents/confirm-08/scratch/source-result.json and return the same JSON. Return exactly {"decision":"verified","fingerprint":"..."} or {"decision":"replace","reason":"...","record":{...}} or {"decision":"rejected","reason":"..."} with no surrounding prose.