# Core

Core holds the pure domain schemas and helpers. It owns the work item and triage vocabulary.

## Language

**Work item**:
The record created when an incident is defined and verified. It carries triage, fix state and subtasks.

**Triage**:
The step that assigns a Work item to a human or an Agent.

**assignee**:
The field that names who handles a Work item. Its value is `needs_human` or `needs_agent_<name>`.

**`needs_human`**:
An assignee value that names a human owner.

**`needs_agent_<name>`**:
An assignee value that names the Agent with that name.

**Auto-fix**:
An Exorcism that starts without a person's action when the boot config sets `fix.enabled: true`. _Avoid_: automatic fix.

**Fix now**:
The user action that starts an Exorcism and, on success, moves the Work item to the front of the fix queue. It is the manual trigger and stays available when Auto-fix is off.

**`fixPriority`**:
The number that orders the fix queue. A lower number sits nearer the front.

**draft pull request**:
The pull request that is the last state of a fix. Graveshift does not merge it.

**Diagnosis**:
The stated root cause of a haunting, with supporting evidence and confidence.

**Event envelope**:
The normalised message that every source publishes to the queue.

**Rule override**:
A client rule that replaces a system rule with the same id.
