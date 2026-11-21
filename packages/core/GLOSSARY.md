# Core

Core holds the pure domain schemas and helpers. It owns the work item and triage vocabulary.

## Work item and triage

**Work item**:
The record created when an incident is defined and verified. It carries triage, fix state and subtasks.

**Triage**:
The step that assigns a Work item to a human or an Agent and sets its auto-fix flag.

**assignee**:
The field that names who handles a Work item. Its value is `needs_human` or `needs_agent_<name>`.

**`needs_human`**:
An assignee value that names a human owner.

**`needs_agent_<name>`**:
An assignee value that names the Agent with that name.

**auto-fix**:
The client setting that starts a fix for a Work item without a Fix now action.

**Fix now**:
The user action that moves a Work item to the front of the fix queue, or triggers a fix when auto-fix is disabled.

**`fixPriority`**:
The number that orders the fix queue. A lower number sits nearer the front.

**draft pull request**:
The pull request that is the last state of a fix. Graveshift does not merge it.

**Diagnosis**:
the stated root cause of a haunting, with supporting evidence and confidence.

## Events and rules

**Event envelope**:
The normalised message that every source publishes to the queue.

**Rule override**:
A client rule that replaces a system rule with the same id.
