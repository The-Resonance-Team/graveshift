import type { ContextBundle, LlmDiagnosis } from './types';

const matchLog = (bundle: ContextBundle, pattern: RegExp): [string, string] | undefined =>
  [...bundle.refs].find(([ref, text]) => ref.startsWith('log:') && pattern.test(text));

const excerpt = (text: string): string => text.slice(0, 200);

// Deterministic: same input, same diagnosis. Rules are ordered, first match wins.
export function rulesOnlyDiagnosis(bundle: ContextBundle): LlmDiagnosis {
  const signal = (rule: string) =>
    bundle.evidence.find((entry) => entry.kind === 'signal' && entry.rule === rule);
  const fromSignal = (rule: string) => {
    const d = signal(rule);
    return d ? { ref: d.ref, excerpt: excerpt(d.text) } : undefined;
  };
  const fromLog = (pattern: RegExp) => {
    const hit = matchLog(bundle, pattern);
    return hit ? { ref: hit[0], excerpt: excerpt(hit[1]) } : undefined;
  };
  const found = (...items: Array<{ ref: string; excerpt: string } | undefined>) =>
    items.filter((i): i is { ref: string; excerpt: string } => i !== undefined);

  const oom = found(fromSignal('runtime.oom'), fromLog(/OOMKilled|out of memory/i));
  if (oom.length > 0) {
    return {
      category: 'resource_exhaustion',
      rootCause: 'The service was killed for exceeding its memory limit.',
      confidence: 0.8,
      evidence: oom,
    };
  }

  const nullAccess = fromLog(
    /TypeError|cannot read propert|null is not an object|undefined is not an object/i,
  );
  if (nullAccess) {
    return {
      category: 'code_bug',
      rootCause: 'A code path dereferences a null or undefined value.',
      confidence: 0.75,
      evidence: [nullAccess],
    };
  }

  const config = found(
    fromLog(
      /ECONNREFUSED|connection refused|password authentication failed|database .* does not exist|getaddrinfo/i,
    ),
    fromSignal('runtime.unhealthy'),
  );
  if (config.length > 0) {
    return {
      category: 'config_error',
      rootCause: 'The service cannot reach its dependency, which points at a configuration error.',
      confidence: 0.7,
      evidence: config,
    };
  }

  const pull = fromSignal('k8s.image-pull');
  if (pull) {
    return {
      category: 'deploy_regression',
      rootCause: 'The deployed image cannot be pulled.',
      confidence: 0.7,
      evidence: [pull],
    };
  }

  const first = bundle.evidence.find(({ kind }) => kind === 'signal') ?? bundle.evidence[0];
  if (first === undefined) throw new Error('prepared evidence is missing its incident');
  return {
    category: 'unknown',
    rootCause: 'No rule matched the available evidence.',
    confidence: 0.2,
    evidence: [{ ref: first.ref, excerpt: excerpt(first.text) }],
  };
}
