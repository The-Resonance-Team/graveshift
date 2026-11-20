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
}

export function createAppAuth({
  appId,
  privateKeyPem,
  installations,
  fetch: fetchFn = fetch,
  now = Date.now,
}: AppAuthOptions): GitHubAppAuth {
  const cache = new Map<string, { token: string; expiresAt: number }>();
  return {
    async installationToken(repo) {
      const installation = installations[repo];
      if (installation === undefined) throw new GitHubAuthError(`app is not installed on ${repo}`);
      const cached = cache.get(repo);
      if (cached && cached.expiresAt - now() > 60_000) return cached.token;
      const res = await fetchFn(
        `https://api.github.com/app/installations/${installation}/access_tokens`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${appJwt(appId, privateKeyPem, now())}`,
            accept: 'application/vnd.github+json',
          },
        },
      );
      // never include the response body: it may carry the token
      if (!res.ok)
        throw new GitHubAuthError(`installation token request failed with ${res.status}`);
      const parsed = TokenResponse.parse(await res.json());
      cache.set(repo, { token: parsed.token, expiresAt: Date.parse(parsed.expires_at) });
      return parsed.token;
    },
  };
}
