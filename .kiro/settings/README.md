# Kiro MCP settings

`mcp.json` is where Kiro reads this project's MCP server configuration. This file is
**gitignored** (see `.gitignore`), so it is never committed.

To set up locally:

1. Copy `mcp.example.json` to `mcp.json` in this directory.
2. Replace every placeholder token (for example `<set locally, never commit>`) with your
   own value in your local `mcp.json` only.
3. Confirm that the GitHub image name, the Kubernetes MCP server command and environment
   interpolation work in your Kiro version before relying on them.

Never commit a real token. Only this example file (with placeholders) and this README are
tracked. The rest of `.kiro/` is committed — do not gitignore it.

A local `mcp.json` is present with the `graveshift` entry disabled. It is disabled because
`packages/mcp-server` is a scaffold stub that exits immediately. Enable it only after the
server implements the tools in `.kiro/specs/mcp-server/requirements.md`.
