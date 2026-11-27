import { createPrivateKey, createSign } from 'node:crypto';

import { GraveshiftError } from '@graveshift/core';
import { z } from 'zod';

export class GitHubAuthError extends GraveshiftError<'GITHUB_AUTH_FAILED'> {
  constructor(message: string) {
    super('GITHUB_AUTH_FAILED', message);
  }
}

// R1.1: the app is installed on selected repositories only, so a repo without an installation id has no token
export interface GitHubAppAuth {
  installationToken(repo: string): Promise<string>;
}

const b64 = (value: string | Buffer) => Buffer.from(value).toString('base64url');

export function appJwt(appId: string, privateKeyPem: string, nowMs: number): string {
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const iat = Math.floor(nowMs / 1000) - 30;
  const payload = b64(JSON.stringify({ iat, exp: iat + 9 * 60, iss: appId }));
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${payload}`)
    .sign(createPrivateKey(privateKeyPem));
  return `${header}.${payload}.${b64(signature)}`;
}

const TokenResponse = z.object({ token: z.string().min(1), expires_at: z.string() });

export interface AppAuthOptions {
  appId: string;
  privateKeyPem: string;
  installations: Record<string, number>;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export function createAppAuth({
  appId,
  privateKeyPem,
  installations,
  fetch: fetchFn = fetch,
  now = Date.now,
  timeoutMs = 30_000,
}: AppAuthOptions): GitHubAppAuth {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new GitHubAuthError('invalid installation token timeout');
  }
  const cache = new Map<string, { token: string; expiresAt: number }>();
  const pending = new Map<string, Promise<string>>();

  async function requestToken(installation: number, signal: AbortSignal) {
    const response = await fetchFn(
      `https://api.github.com/app/installations/${installation}/access_tokens`,
      {
        method: 'POST',
        signal,
        redirect: 'error',
        headers: {
          authorization: `Bearer ${appJwt(appId, privateKeyPem, now())}`,
          accept: 'application/vnd.github+json',
        },
      },
    );
    if (signal.aborted || !response.ok || response.body === null) {
      void response.body?.cancel().catch(() => {});
      signal.throwIfAborted();
      throw new GitHubAuthError(`installation token request failed with ${response.status}`);
    }
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    await response.body.pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          bytes += chunk.byteLength;
          if (bytes > 64 * 1024)
            throw new GitHubAuthError('installation token response exceeds limit');
          chunks.push(chunk);
        },
      }),
      { signal },
    );
    signal.throwIfAborted();
    const parsed = TokenResponse.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    const expiresAt = Date.parse(parsed.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= now()) {
      throw new GitHubAuthError('installation token response has an invalid expiry');
    }
    return { token: parsed.token, expiresAt };
  }

  return {
    async installationToken(repo) {
      const installation = installations[repo];
      if (installation === undefined) throw new GitHubAuthError(`app is not installed on ${repo}`);
      const cached = cache.get(repo);
      if (cached && cached.expiresAt - now() > 60_000) return cached.token;
      const active = pending.get(repo);
      if (active) return active;
      const refresh = (async () => {
        const signal = AbortSignal.timeout(timeoutMs);
        const expired = Promise.withResolvers<never>();
        const abort = () =>
          expired.reject(new GitHubAuthError('installation token request timed out'));
        signal.addEventListener('abort', abort, { once: true });
        try {
          // Race the complete read as an injected transport may ignore cancellation.
          const token = await Promise.race([requestToken(installation, signal), expired.promise]);
          signal.throwIfAborted();
          cache.set(repo, token);
          return token.token;
        } catch (error) {
          if (error instanceof GitHubAuthError) throw error;
          throw new GitHubAuthError(
            signal.aborted
              ? 'installation token request timed out'
              : 'installation token response could not be read',
          );
        } finally {
          signal.removeEventListener('abort', abort);
        }
      })();
      pending.set(repo, refresh);
      try {
        return await refresh;
      } finally {
        pending.delete(repo);
      }
    },
  };
}
