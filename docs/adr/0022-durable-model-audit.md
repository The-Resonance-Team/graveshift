# Accept model results only after durable audit

Status: accepted

On 2026-11-21 the owner chose to withhold a model result when its durable audit record cannot be acknowledged. The gateway determines its result once and performs one explicit audit handoff. An audit failure is distinct from validation, fallback and provider failure; it must not cause a second model call or a second terminal audit attempt. Known usage remains visible in the failure outcome.

Required audit records must also be written before privileged actions. When an external effect has already occurred, its known result is retained: an Exorcism reference must not disappear because labels or a later audit write failed. Recovery reconciles an uncertain effect before another write. This does not claim a database transaction can include GitHub or runtime effects.

The trade-off is lower availability during an audit outage. In return, downstream work cannot treat an unaudited model result as accepted. ADR 0012 and ADR 0013 still own the durable Audit chain and atomic Credential changes.
