export interface K8sEvent {
  uid: string;
  reason: string;
  message: string;
  type: string;
  namespace: string;
  involvedKind: string;
  involvedName: string;
  resourceVersion: string;
  at: string;
}

export interface DeploymentInfo {
  name: string;
  namespace: string;
  replicas: number;
  ready: number;
  selector: Record<string, string>;
}

export class WatchExpiredError extends Error {
  constructor() {
    super('resourceVersion too old (410 Gone)');
  }
}

// Narrow, read-only surface; the in-cluster implementation only uses get/list/watch verbs.
export interface KubeApi {
  listDeployments(): Promise<DeploymentInfo[]>;
  podNames(namespace: string, selector: Record<string, string>): Promise<string[]>;
  podOomKilled(namespace: string, pod: string): Promise<boolean>;
  readLog(namespace: string, pod: string, lines: number): Promise<string>;
  latestEventVersion(): Promise<string>;
  watchEvents(
    resourceVersion: string,
    onEvent: (event: K8sEvent) => void,
    signal: AbortSignal,
    onOpen: () => void,
  ): Promise<void>;
}
