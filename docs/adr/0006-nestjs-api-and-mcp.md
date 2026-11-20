# NestJS owns the external API; MCP uses the official module

Status: accepted

A dedicated NestJS API is the only external surface. It owns authentication, rate limiting, OpenAPI, SSE and the MCP endpoint. The daemon keeps only health and a local command inbox; no client calls it directly.

MCP uses the official `@nestjs/mcp` module (v0.0.4 at adoption). Tool logic stays in plain injectable providers; decorators and transport stay thin. The module has no sessions and no runtime tool registration, which the current tools do not need. A compatibility test covers a `2025-06-18` client.

The frontend consumes generated OpenAPI types and a published TypeScript event package. The frontend engineer owns visual design; no pixel specification is kept in this repo.

Trade-off: one more process to deploy, but auth and protocol code are not reimplemented in the daemon.
