# MCP Server (graveshift-mcp) — Requirements

## R1 Tools (§10.5)
- R1.1 WHEN a client calls `list_services`, `list_incidents`, `get_incident`, `get_diagnosis`, `get_audit_log` or `verify_audit_chain` THE SYSTEM SHALL return the specified read-only result.
- R1.2 WHEN a tool accepts input THE SYSTEM SHALL validate it with a Zod schema, including limits (`list_incidents` ≤ 50, `tail_logs` ≤ 200, `get_audit_log` ≤ 100, `query_metric` range ≤ 60).

## R2 Policy passthrough
- R2.1 WHEN `propose_fix` is called THE SYSTEM SHALL pass through PolicyEngine and never bypass approval.
- R2.2 WHEN `query_metric` is called THE SYSTEM SHALL enforce the PromQL allowlist.

## R3 Redaction
- R3.1 WHEN `tail_logs` or any response contains external content THE SYSTEM SHALL redact it before returning.

## R4 Transports
- R4.1 The server SHALL support stdio for Kiro and Streamable HTTP for remote/Crew use.
- R4.2 WHEN HTTP is used THE SYSTEM SHALL require an MCP bearer token issued by `POST /api/credentials` and verified by the shared credential component.

## R5 Resources and prompts
- R5.1 The server SHALL expose `graveshift://incidents/{id}/postmortem` and the `triage-incident` / `write-postmortem` prompts.
