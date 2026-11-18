# MCP Server — Design

## Interfaces
- Tool registry with `{ name, inputSchema: Zod, handler }`.
- Transports: stdio and Streamable HTTP with bearer-token middleware.

## Data flow
Client request → Zod validation → redaction where needed → handler (read store / PolicyEngine / actuator seam) → response.

## Error handling
- Invalid input → validation error. Unauthorized HTTP → 401. No tool bypasses PolicyEngine for write-like actions.

## Testing
- Zod input boundary tests; transport smoke tests; policy-passthrough test for `propose_fix`.
