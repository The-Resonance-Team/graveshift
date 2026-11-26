# Local validation environment contract

No target-controlled check was run during this audit. This document is a plan for resolving local validation blockers after all controls below are available. It is not evidence that a vulnerability was reproduced.

Use an existing disposable, isolated environment with an OS-enforced process-tree budget. Do not install dependencies, fetch images, contact a registry, or mount a shared Docker/host-control socket to prepare a check. Source, tools and already-present dependencies must be read-only. A parent-owned source copy may live in the assigned scratch directory when a test must write beside source.

For a small function, in-memory service or parser check, start with these explicit ceilings. Reduce them when possible; record a justified change before execution when the selected fixture needs more.

| Control | Initial ceiling or policy |
| --- | --- |
| External network | Denied for the full process tree |
| Loopback | Denied unless the particular fixture needs it; then use a private network namespace with only that disposable client/server |
| CPU | One CPU and a total CPU-time ceiling of 5 seconds |
| Memory | 256 MiB for the complete process tree, with swap disabled |
| Processes/threads | At most 16 processes; bounded threads enforced by the same isolated resource domain |
| Per-file size | At most 4 MiB |
| Aggregate writable disk | At most 32 MiB in a bounded filesystem/quota |
| Wall clock | At most 10 seconds, enforced by a trusted supervisor that terminates every descendant |
| Open descriptors | At most 64 per process |
| Writable locations | Only the check's assigned scratch root; no host home, global cache, retained artifacts, other agent scratch, credentials, sockets or services |

Start from an empty environment. Populate only the variables required for the selected fixture. Use a safe toolchain `PATH`, scratch-local home and temporary/cache directories, a fixed locale, and disabled Bun transpiler cache when appropriate. Dummy identity/provider values may be added only when necessary; list their names and safe values in the check record. Do not inherit the ambient environment or read `.env` and ignored local settings. Prevent package-manager auto-install paths and network-backed build steps.

Use two dummy Projects/Organizations for isolation checks, fake collectors, fake GitHub/provider/runtime adapters, and synthetic non-secret logs or records. An invocation must stop at one wrong read, suppressed dummy Event, unauthorized dummy selector, failed gate, or equivalent minimum boundary result. Do not stress availability or extend the check to a real publication, runtime mutation or provider call.

Record the exact input, native call, command, allowlisted environment, limits and observed return/output. Source inspection and an unexecuted existing test are not an observed result.

If a check needs a retained output file, the trusted parent must declare it and its size limits before execution, retain non-inheritable source/destination directory descriptors, wait for the entire sandbox process tree to terminate, and perform the no-follow descriptor-relative regular-file promotion required by the security-audit skill. A zero-artifact in-memory return is preferable. No output from this audit was promoted through that path.

Owner observations for deployment-only blockers inspect the selected configuration, identity mapping, permission attachment or topology. They do not send audit payloads to a deployed/shared endpoint.
