import type { GitHubClient } from '@graveshift/fixer';

export function cancellableGitHub(client: GitHubClient, signal?: AbortSignal): GitHubClient {
  if (signal === undefined) return client;
  return new Proxy(client, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        signal.throwIfAborted();
        return Reflect.apply(value, target, args);
      };
    },
  });
}
