You are a fresh independent verifier confirm-14b of a newly confirmed finding. Verify the record and its bounded local evidence from source; do not merely accept the harness claim.

Target: /Users/xirothedev/workspace/graveshift
Agent ID: confirm-14b
Do not execute project code, tests, builds, or network requests. Do not read ignored secrets/local settings. Do not edit target source or shared audit files.

Confirmed record under review:
{
  "fingerprint": "packages/actuator/createDockerRestarter/compose-project-binding",
  "title": "Docker restart selection can cross Compose project boundaries",
  "description": "When a Blessing is intended to restart one Project's worker service, a caller holding that fresh signed request can potentially cause the actuator's Docker identity to restart unrelated worker containers in other Compose projects on the same daemon. The writer selects all running containers with the service label and invokes restart for every returned ID. The request can remain exactly as approved and correctly signed; the unresolved issue is which resources that service name resolves to. This requires an enabled act-mode configuration, shared-daemon co-tenancy, per-project approval intent and a proxy that exposes both projects. The checked-in configuration is propose, and the in-repo platform-to-actuator producer is deferred. No deployed exposure or runtime effect was observed.",
  "trace": [
    {
      "kind": "entrypoint",
      "file": "packages/actuator/src/handler.ts",
      "line": 35,
      "scope": "createActionHandler POST /actions",
      "description": "A request submitter delivers one signed runtime action through the bounded JSON action endpoint."
    },
    {
      "kind": "propagation",
      "file": "packages/actuator/src/execute.ts",
      "line": 95,
      "scope": "createActuator.execute",
      "description": "The executor strictly parses the action and verifies its HMAC; this prevents mutation but authenticates only the resource fields present in the schema."
    },
    {
      "kind": "propagation",
      "file": "packages/actuator/src/claims.ts",
      "line": 62,
      "scope": "admissionDecision",
      "description": "Admission checks the approval identity, action/incident binding, time, policy and action count for the signed service name."
    },
    {
      "kind": "propagation",
      "file": "packages/policy/src/decide.ts",
      "line": 48,
      "scope": "decide runtime allowlist",
      "description": "The explicit target allowlist compares ctx.service to rule service strings and cannot distinguish different Compose projects with the same service name."
    },
    {
      "kind": "propagation",
      "file": "packages/actuator/src/admission-durable.ts",
      "line": 97,
      "scope": "DurableAdmission.claim",
      "description": "A successful unique token/action claim commits before execution. This correctly prevents replay of the request but does not narrow its resolved container membership."
    },
    {
      "kind": "propagation",
      "file": "packages/actuator/src/execute.ts",
      "line": 56,
      "scope": "run Docker restart",
      "description": "The backend receives only action.service; no Project or Compose-project identity is supplied."
    },
    {
      "kind": "propagation",
      "file": "packages/actuator/src/backends.ts",
      "line": 22,
      "scope": "createDockerRestarter.restart container lookup",
      "description": "The Docker list filter contains only com.docker.compose.service=<service>. The returned set is not checked against another ownership predicate."
    },
    {
      "kind": "sink",
      "file": "packages/actuator/src/backends.ts",
      "line": 40,
      "scope": "createDockerRestarter.restart fan-out",
      "description": "The actuator sends POST /containers/<Id>/restart for every returned ID under the host proxy's Docker authority, potentially including the unrelated project's same-named service."
    }
  ],
  "evidence": [
    {
      "file": "packages/actuator/src/types.ts",
      "line": 7,
      "description": "The strict action object includes action/incident IDs, service, runtime, kind and optional replicas, with no Project, Compose-project or deployment selector."
    },
    {
      "file": "packages/actuator/src/sign.ts",
      "line": 18,
      "description": "The signature covers the entire accepted action, approval and context, which prevents tampering but cannot bind a resource scope absent from that object."
    },
    {
      "file": "packages/actuator/src/backends.ts",
      "line": 22,
      "description": "The sole lookup predicate is the Compose service label; lines 38-46 restart every returned container."
    },
    {
      "file": "packages/actuator/src/main.ts",
      "line": 74,
      "description": "The production launcher instantiates this backend from DOCKER_PROXY_URL without an additional Project or Compose-project binding."
    },
    {
      "file": "deploy/compose/graveshift.compose.yml",
      "line": 29,
      "description": "The maintained actuator proxy mounts the host Docker socket and enables container access, POST and restarts. No project-specific filtering is expressed here; effective image and deployment behavior remain unverified."
    },
    {
      "file": "graveshift.config.yaml",
      "line": 62,
      "description": "The committed default mode is propose, so activation of the runtime sink requires an owner-reviewed act-mode configuration."
    },
    {
      "file": "docs/adr/0017-deployment-topology.md",
      "line": 76,
      "description": "The platform-to-actuator producer is described as a future action hop rather than part of the current Fix path. Reachability from a real approval producer must be established separately."
    }
  ],
  "verdict": "confirmed",
  "root_cause": "The trusted resource resolver in createDockerRestarter authorizes by com.docker.compose.service alone. ActionRequest has no signed Project or Compose-project scope, policy checks only the service name, and the backend neither adds a trusted com.docker.compose.project predicate nor verifies ownership of the returned container IDs before fan-out. A valid approval for one scoped service can therefore name a broader host-level resource set when projects share service names.",
  "intended_behavior": "A Blessing must authorize only the signed service resource scope.",
  "conditions": [
    {
      "kind": "system_configuration",
      "description": "The observation used a bounded dummy-data fixture inside the compliant container; deployment preconditions are recorded in the source trace."
    }
  ],
  "execution": {
    "attacker_perspective": "Holder of the lower-trust capability described in the title.",
    "payloads": [
      "{\"listDecodedFilters\":\"{\\\"label\\\":[\\\"com.docker.compose.service=worker\\\"]}\",\"listFilter\":{\"label\":[\"com.docker.compose.service=worker\"]},\"listFilterHasProjectPredicate\":false,\"restartTargets\":[\"container-aaaadummy\",\"container-bbbbdummy\"],\"bothDifferentProjectContainersRestarted\":true,\"restartMethods\":[\"POST\",\"POST\"]}"
    ],
    "instructions": [
      "Run 14-actuator-docker-project.ts inside the compliant container using validation/run-check.sh (or run-check-macos.sh for the patched-platform harness); the harness prints one structured observed result."
    ],
    "observed_result": "The list filter contains only the com.docker.compose.service label with no project predicate; both containers (dummy-project-alpha and dummy-project-beta) were POST-restarted."
  },
  "remediation": {
    "strategy": "Add a signed Project or Compose-project predicate to the signed action and container lookup, and verify returned container ownership before restart fan-out."
  },
  "severity": {
    "likelihood": {
      "score": "medium",
      "reason": "Requires act mode, shared-daemon co-tenancy, and duplicate service labels."
    },
    "impact": {
      "score": "medium",
      "reason": "Restarts containers belonging to another Compose project."
    },
    "overall_severity": "medium"
  },
  "confidence": {
    "score": "high",
    "reason": "The minimum boundary result was observed in a compliant container with dummy data."
  }
}

Observed bounded result from the compliant container:
{"lead":"packages/actuator/createDockerRestarter/compose-project-binding","verdict":"confirmed","observed":{"listDecodedFilters":"{\"label\":[\"com.docker.compose.service=worker\"]}","listFilter":{"label":["com.docker.compose.service=worker"]},"listFilterHasProjectPredicate":false,"restartTargets":["container-aaaadummy","container-bbbbdummy"],"bothDifferentProjectContainersRestarted":true,"restartMethods":["POST","POST"]},"reason":"The list filter contains only the com.docker.compose.service label with no project predicate; both containers (dummy-project-alpha and dummy-project-beta) were POST-restarted."}


Harness source: /Users/xirothedev/security-audit-skill/graveshift/run-1/validation/14-actuator-docker-project.ts. Read it. Container controls are in /Users/xirothedev/security-audit-skill/graveshift/run-1/validation/run-check.sh and /Users/xirothedev/security-audit-skill/graveshift/run-1/validation/CONTRACT.md; read both and confirm the harness used only dummy data, no network, read-only target, scratch-only bounded writes, 512 MiB memory, 1 CPU, 64 pids, and a hard timeout.

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

Save your exact JSON to /Users/xirothedev/security-audit-skill/graveshift/run-1/agents/confirm-14b/scratch/source-result.json and return the same JSON. Return exactly {"decision":"verified","fingerprint":"..."} or {"decision":"replace","reason":"...","record":{...}} or {"decision":"rejected","reason":"..."} with no surrounding prose.