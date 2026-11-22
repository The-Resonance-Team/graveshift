import { GraveshiftMcpConfigError } from './errors';

/**
 * A credential the caller passes in: a literal token, or a provider the client
 * calls when it needs a token. The package stores no secret of its own: it
 * never reads the environment, a file or a keychain for a credential value.
 */
export type Credential = string | (() => string | Promise<string>);

/** Run the caller's credential choice down to a token string. */
export async function resolveCredential(credential: Credential): Promise<string> {
  if (typeof credential === 'string') return credential;
  const value = await credential();
  if (typeof value !== 'string') {
    throw new GraveshiftMcpConfigError('credential provider must return a string');
  }
  return value;
}
