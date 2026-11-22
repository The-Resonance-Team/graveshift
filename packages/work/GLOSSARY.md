# Work

Work holds pure decisions and typed private contracts for Work items. It owns the assignment and fix-trigger vocabulary.

## Language

**Work item**:
The record created when an incident is defined and verified. It carries triage, fix state and subtasks.

**Human assignment**:
A Work item assigned to a person for a manual fix. Graveshift runs no fix for this assignment and rejects "Fix now".

**Agent assignment**:
A Work item assignment that selects one configured Agent to prepare its fix. Keyword routing cannot replace an explicit assignment.

**Auto-fix**:
A fix that starts without a user action when the assigned Agent trigger is enabled. An enabled trigger starts automatically and rejects "Fix now".

**Fix now**:
The user action that starts a fix for an Agent assignment when its `autoFix` trigger is disabled. It waits for the attempt outcome. It is unavailable for a Human assignment.

**Fix attempt**:
One recorded effort by an assigned Agent to prepare an Exorcism for a Work item. A complete answer to a saved question resumes the same attempt and its original trigger.

**Work state call**:
The one typed value passed to each state operation. It keeps private command and state contracts stable.

**Fenced transition**:
A state change guarded by the item revision, the active claim and the command identity. A repeated command identity returns saved progress or a result; a changed input is a conflict.
