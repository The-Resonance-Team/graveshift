# Runtime Sources — Design

## Interfaces
- Collector lifecycle and read contracts live in `packages/integrations`.
- Docker and Kubernetes own protocol adapters. The shared watch and delivery implementation owns retry, bounded pending work and stop.

## Data flow
1. The Collector prepares an Event envelope and publishes through NATS.
2. It retries a failed publish with the same identity before advancing the delivery cursor.
3. The daemon consumes the envelope and runs Wraith. Collector code evaluates no rule.

## Error handling
- Connection loss emits a Collector notice. Bounded retries keep publication failure separate from observed source progress. Stop preserves replay eligibility for unacknowledged work.

## Testing
- Contract suite shared by both sources; K8s event-mapping unit tests with fixture events.
