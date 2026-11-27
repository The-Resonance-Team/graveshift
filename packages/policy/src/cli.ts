#!/usr/bin/env bun
import { loadPolicy, PolicyError } from './load';

export async function main(argv: string[]): Promise<number> {
  const [group, command, file = 'policy.yaml'] = argv;
  if (group !== 'policy' || command !== 'check') {
    process.stderr.write('usage: graveshift policy check [file]\n');
    return 2;
  }
  try {
    const policy = await loadPolicy(file);
    process.stdout.write(
      `OK ${file}: mode=${policy.mode}, ${policy.rules.length} rules, default=deny\n`,
    );
    return 0;
  } catch (error) {
    if (!(error instanceof PolicyError)) throw error;
    process.stderr.write(`INVALID ${file}\n${error.issues.map((i) => `  ${i}`).join('\n')}\n`);
    return 1;
  }
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)));
