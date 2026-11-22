# Agents

Agents holds the config and routing helpers for the crew.

## Language

**Agent**:
A configured worker with a role, a prompt and a model. The crew calls an Agent a Ghost.
_Avoid_: Bot

**Routing agent**:
The built-in agent that selects a target agent by trigger keywords and fills prompt params from a request.
