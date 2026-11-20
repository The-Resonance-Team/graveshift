// The DESIGN.md Term table. Every themed label renders with its plain meaning as a tooltip.
export const TERMS = {
  service: { label: 'Grave', plain: 'A watched service' },
  healthy: { label: 'Resting in peace', plain: 'Service is healthy' },
  incident: { label: 'Haunting', plain: 'An incident' },
  crashLoop: { label: 'Restless spirit', plain: 'Repeated restarts' },
  oom: { label: 'Drained by a leech', plain: 'Out-of-memory termination' },
  fixPr: { label: 'Exorcism', plain: 'Draft pull request with a fix' },
  approve: { label: 'Bless', plain: 'Approve a runtime action' },
  reject: { label: 'Banish', plain: 'Reject a runtime action' },
  silence: { label: 'Salt line', plain: 'Silence signals for a service' },
  postmortem: { label: 'Autopsy', plain: 'Postmortem report' },
  dashboard: { label: 'Graveyard', plain: 'Dashboard that shows every watched service' },
  diagnosis: { label: 'Diagnosis', plain: 'Stated root cause with evidence and confidence' },
  auditLog: { label: 'Audit chain', plain: 'Ordered, tamper-evident record of decisions' },
  agent: { label: 'Ghost', plain: 'An AI agent in the crew' },
  watcher: { label: 'Wraith', plain: 'The ghost that watches signals' },
  diagnoser: { label: 'Medium', plain: 'The ghost that builds a diagnosis' },
  fixer: { label: 'Exorcist', plain: 'The ghost that prepares a draft fix pull request' },
  notifier: { label: 'Banshee', plain: 'The ghost that notifies people and collects approvals' },
} as const;
export type TermKey = keyof typeof TERMS;

// Detector rules shown with a themed name when the Term table has one.
export const RULE_TERM: Record<string, TermKey | undefined> = {
  'runtime.restart-loop': 'crashLoop',
  'runtime.oom': 'oom',
};

export const MODE_COPY = {
  'dry-run': 'Dry run: Graveshift only reports what it would do',
  propose: 'Propose: draft pull requests are allowed, runtime actions need a blessing',
  act: 'Act: approved runtime actions run after a blessing',
} as const;

// Plain descriptions from docs/DEMO.md.
export const SCENARIOS = [
  {
    id: 'null-candy',
    target: 'api',
    plain: 'Candy 1 loses its price, so GET /candies/1 returns 500',
  },
  { id: 'memory-leech', target: 'worker', plain: 'The worker leaks memory until it is killed' },
  { id: 'wrong-potion', target: 'api', plain: 'The api switches to a stale database URL' },
  { id: 'slow-curse', target: 'api', plain: 'Search loses its index and takes about 1.8 s' },
  {
    id: 'image-ghost',
    target: 'deploy',
    plain: 'Kubernetes only: a bad image tag cannot be pulled',
  },
] as const;
