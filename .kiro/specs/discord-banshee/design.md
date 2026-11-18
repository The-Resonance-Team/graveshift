# Discord — Design

## Interfaces
- `registerCommands(guildId)` — per-guild slash command registration.
- `handleInteraction(i)` — approver check → defer → token consume → PolicyEngine → actuator → edit embed.
- `buildIncidentEmbed(incident)` — severity color, evidence, PR link.

## Data flow
Discord interaction → approver guard → defer → approval token check → policy decision → actuator → embed edit + thread timeline.

## Error handling
- Non-approver → ephemeral rejection. Expired/replayed token → reject. Bot token absent → webhook path.

## Testing
- Embed snapshot tests; approver/token unit tests; fast-check property that a token is never accepted twice, after expiry, or from a non-approver (§14.2 #4).
