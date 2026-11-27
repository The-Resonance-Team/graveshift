// Bounded validation harness: kiro-hooks.guard-shell.event-shape-fail-open
// Spawns the real guard with controlled stdin only. Embedded commands are never
// executed; the guard merely reads stdin and exits with a code.
const LEAD = 'kiro-hooks.guard-shell.event-shape-fail-open';
const GUARD = '/target/scripts/kiro/guard-shell.mjs';

type Case = { label: string; payload: string };

const cases: Case[] = [
  {
    label: 'recognizedShapeKnownDangerous',
    payload: JSON.stringify({ command: 'rm -rf /' }),
  },
  {
    label: 'recognizedShapeBenign',
    payload: JSON.stringify({ command: 'echo dummy-safe-marker' }),
  },
  {
    label: 'unrecognizedShapeKnownDangerous',
    // The guard probes tool_input/toolInput, not tool.input.
    payload: JSON.stringify({ tool: { input: { command: 'rm -rf /' } } }),
  },
  {
    label: 'semanticallyEquivalentCommand',
    payload: JSON.stringify({ command: 'rm -rf /;true' }),
  },
];

async function exitCodeFor(payload: string): Promise<number | null> {
  const child = Bun.spawn(['bun', GUARD], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    child.stdin.write(payload);
    child.stdin.end();
    const code = await child.exited;
    return code;
  } catch (error: any) {
    // Still await the child so no process is left behind.
    try {
      await child.exited;
    } catch {
      /* ignore */
    }
    throw error;
  }
}

async function main() {
  const exitCodes: Record<string, number | null> = {};
  for (const testCase of cases) {
    exitCodes[testCase.label] = await exitCodeFor(testCase.payload);
  }

  const recognizedBlocked = exitCodes.recognizedShapeKnownDangerous === 2;
  const benignAllowed = exitCodes.recognizedShapeBenign === 0;
  const failOpenObserved = exitCodes.unrecognizedShapeKnownDangerous === 0;
  const regexMissObserved = exitCodes.semanticallyEquivalentCommand === 0;

  const observed = {
    exitCodes,
    recognizedShapeBlocked: recognizedBlocked,
    benignShapeAllowed: benignAllowed,
    failOpenOnUnrecognizedShape: failOpenObserved,
    regexMissOnSemanticEquivalent: regexMissObserved,
    commandsExecuted: false,
  };

  if (failOpenObserved || regexMissObserved) {
    return {
      lead: LEAD,
      verdict: 'confirmed',
      observed,
      reason:
        'The real guard blocked the recognized literal shape (exit 2) and allowed a benign command ' +
        '(exit 0), but exited 0 both for a destructive command nested in an unprobed event shape ' +
        'and for the semantically equivalent "rm -rf /;true". That is the fail-open / missing ' +
        'regex boundary result, observed from exit codes only with dummy stdin; no shell command ' +
        'was executed.',
    };
  }
  if (recognizedBlocked && !failOpenObserved && !regexMissObserved) {
    return {
      lead: LEAD,
      verdict: 'rejected',
      observed,
      reason:
        'The real guard exited 2 for both the unrecognized-shape payload and the semantically ' +
        'equivalent command, so no fail-open or regex miss was observed.',
    };
  }
  return {
    lead: LEAD,
    verdict: 'inconclusive',
    observed,
    reason:
      'The guard did not produce the expected recognized-shape baseline, so the boundary result ' +
      'cannot be attributed: ' + JSON.stringify(exitCodes),
  };
}

try {
  console.log(JSON.stringify(await main()));
} catch (error: any) {
  console.log(
    JSON.stringify({
      lead: LEAD,
      verdict: 'inconclusive',
      observed: { error: String(error), stack: String(error?.stack ?? '').slice(0, 1500) },
      reason: 'The bounded guard-spawn harness could not complete; exact failure captured.',
    }),
  );
}
