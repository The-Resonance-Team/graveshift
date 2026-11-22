// Bun-native equivalent of a Vitest setup file. The repo runs bun:test with a
// preload in bunfig.toml; this module installs the same beforeAll/afterEach/
// afterAll lifecycle. The emulators are local and stateful, never a real network.
import { afterAll, afterEach, beforeAll } from 'bun:test';
import { createEmulator, type Emulator } from 'emulate';

export const EMULATOR_URL_ENV = {
  github: 'GITHUB_EMULATOR_URL',
  ai: 'AI_EMULATOR_URL',
} as const;

const seedPath = new URL('./emulate.seed.yaml', import.meta.url);

/** Start github + ai emulators, reset after each test, close after the suite. */
export function useFixEmulators(): {
  urls: () => { github: string; ai: string };
  appPrivateKey: () => string;
} {
  let github: Emulator | undefined;
  let ai: Emulator | undefined;
  const originalUrls: Record<string, string | undefined> = {};

  beforeAll(async () => {
    const seed: unknown = Bun.YAML.parse(await Bun.file(seedPath).text());
    [github, ai] = await Promise.all([
      createEmulator({
        service: 'github',
        port: 0,
        seed: { github: (seed as Record<string, unknown>).github },
      }),
      createEmulator({
        service: 'ai',
        port: 0,
        seed: { ai: (seed as Record<string, unknown>).ai },
      }),
    ]);
    originalUrls[EMULATOR_URL_ENV.github] = process.env[EMULATOR_URL_ENV.github];
    originalUrls[EMULATOR_URL_ENV.ai] = process.env[EMULATOR_URL_ENV.ai];
    process.env[EMULATOR_URL_ENV.github] = github.url;
    process.env[EMULATOR_URL_ENV.ai] = ai.url;
  });

  afterEach(async () => {
    await github?.reset();
    await ai?.reset();
  });

  afterAll(async () => {
    try {
      await Promise.all([github?.close(), ai?.close()]);
    } finally {
      for (const [name, original] of Object.entries(originalUrls)) {
        if (original === undefined) delete process.env[name];
        else process.env[name] = original;
      }
    }
  });

  return {
    urls: () => ({
      github: process.env[EMULATOR_URL_ENV.github] ?? '',
      ai: process.env[EMULATOR_URL_ENV.ai] ?? '',
    }),
    appPrivateKey: () => {
      const key = github?.generatedSecrets.find(
        (secret) => secret.kind === 'github.app_private_key' && secret.id === '12345',
      );
      if (key === undefined) throw new Error('emulator did not generate the GitHub App key');
      return key.value;
    },
  };
}

/** Rewrite the official API host to the emulator host. Config keeps HTTPS URLs. */
export function rewriteHost(target: string): typeof fetch {
  const base = new URL(target);
  const rewritten = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const source =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(source);
    url.protocol = base.protocol;
    url.host = base.host;
    return fetch(url, init);
  };
  // Adapter boundary: Bun extends fetch with preconnect, which the rewrite does not need.
  return rewritten as typeof fetch;
}
