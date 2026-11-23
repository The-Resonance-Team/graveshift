import type { WorkCommands } from '@graveshift/work';

import { HttpFailure } from './private-http';

export function drainCommands(commands: WorkCommands) {
  const pending = new Set<Promise<unknown>>();
  let closing = false;
  const run = <Value>(start: () => Promise<Value>): Promise<Value> => {
    if (closing) return Promise.reject(new HttpFailure(503, 'Daemon is stopping'));
    const work = Promise.resolve().then(start);
    pending.add(work);
    void work.then(
      () => pending.delete(work),
      () => pending.delete(work),
    );
    return work;
  };
  const owned: WorkCommands = {
    triage: (caller, id, body) => run(() => commands.triage(caller, id, body)),
    fixNow: (caller, id, body) => run(() => commands.fixNow(caller, id, body)),
    answer: (caller, id, body) => run(() => commands.answer(caller, id, body)),
  };
  return {
    commands: owned,
    async stop() {
      closing = true;
      await Promise.allSettled(pending);
    },
  };
}
