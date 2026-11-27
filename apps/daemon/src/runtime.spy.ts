import type { WorkRuntime } from '@graveshift/work';

/**
 * Observes the real WorkRuntime without holding state of its own. Every transition still happens
 * in the API over Postgres; a test may replace one method here to inject a fault at the seam.
 */
export function spyWorkRuntime(real: WorkRuntime) {
  const calls: string[] = [];
  const track =
    <Args extends unknown[], Value>(name: string, base: (...args: Args) => Value) =>
    (...args: Args): Value => {
      calls.push(name);
      return base(...args);
    };
  const runtime: WorkRuntime = {
    read: track('read', (ref) => real.read(ref)),
    replay: track('replay', (caller, id, request) => real.replay(caller, id, request)),
    saveTriage: track('saveTriage', (caller, id, input) => real.saveTriage(caller, id, input)),
    claim: track('claim', (caller, id, input) => real.claim(caller, id, input)),
    saveQuestion: track('saveQuestion', (caller, id, input) =>
      real.saveQuestion(caller, id, input),
    ),
    applyAnswer: track('applyAnswer', (caller, id, input) => real.applyAnswer(caller, id, input)),
    beginPublication: track('beginPublication', (caller, id, input) =>
      real.beginPublication(caller, id, input),
    ),
    recordPublication: track('recordPublication', (caller, id, input) =>
      real.recordPublication(caller, id, input),
    ),
    finish: track('finish', (caller, id, input) => real.finish(caller, id, input)),
    heartbeat: track('heartbeat', (caller, id, input) => real.heartbeat(caller, id, input)),
    abandon: track('abandon', (caller, id, input) => real.abandon(caller, id, input)),
    abortPublication: track('abortPublication', (caller, id, input) =>
      real.abortPublication(caller, id, input),
    ),
  };
  return { runtime, calls };
}
