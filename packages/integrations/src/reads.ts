export interface GraveInfo {
  name: string;
  runtime: 'docker' | 'k8s';
  namespace?: string;
}

export interface GraveHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  checkedAt: string;
  detail?: string;
}

/** Inventory and evidence reads owned by an infrastructure Collector. */
export interface CollectorReads {
  listServices(): Promise<GraveInfo[]>;
  tailLogs(service: string, lines: number): Promise<string[]>;
  getHealth(service: string): Promise<GraveHealth>;
}
