# YAML is the config source of truth with a read-only API view

Status: superseded by ADR 0015

On 2026-11-21 the owner chose YAML as the source of truth for agent and policy config in v2. The loaders validated the config at boot. Invalid config stopped boot. The owner kept no hot reload in v2. A config change needed a file edit and a restart.

The API exposed a read-only view of the validated config. The API did not write config files. The API did not hold config for editing. Another team owned the dashboard. This repo shipped contracts and endpoint definitions only. The owner kept no visual design and no UI code here.

The owner kept the rule from ADR 0007. A config file held no secret. A key came only from the environment. Boot settings lived in one schema.
That schema covered the host, the port, the event backbone settings, the file paths and the auth settings.

ADR 0009 already removed the v1 daemon.
This decision, ADR 0012 and ADR 0013 superseded the remaining part of ADR 0003 that kept the v1 daemon for reference. The owner removed the v1 config path with the v1 daemon. Agents and policy kept their own loaders. The owner kept no third config format.

Recheck trigger: The owner reviews this decision when write authorization and an audit path for config edits exist. The owner also reviews this decision when multi-tenancy arrives in v3.

Trade-off: Config changes needed a restart. Boot validation and version control stayed simple. The config file stayed the only place that held config.
