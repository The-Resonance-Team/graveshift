import { AsyncLocalStorage } from 'node:async_hooks';

export interface ModelContext {
  incidentId: string;
  service: string;
  signal?: AbortSignal;
}

const current = new AsyncLocalStorage<Readonly<ModelContext>>();

export function withModelContext<Value>(
  context: ModelContext,
  work: () => Promise<Value>,
): Promise<Value> {
  return current.run(Object.freeze({ ...context }), work);
}

export function modelContext(): Readonly<ModelContext> | undefined {
  return current.getStore();
}
