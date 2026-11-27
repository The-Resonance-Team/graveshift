import { GraveshiftError } from '@graveshift/core';
import { z } from 'zod';

import { GraveshiftConfigSchema, type GraveshiftConfig } from './schema';

export class GraveshiftConfigError extends GraveshiftError<'GRAVESHIFT_CONFIG_INVALID'> {
  constructor(message: string) {
    super('GRAVESHIFT_CONFIG_INVALID', message);
  }
}

// One committed file at the repo root is the source of truth. The override is for
// tests and alternate deployments; it never selects a second config format.
export const DEFAULT_CONFIG_PATH = new URL('../../../graveshift.config.yaml', import.meta.url);

export function resolveConfigPath(
  path: string | URL = process.env.GRAVESHIFT_CONFIG_PATH ?? DEFAULT_CONFIG_PATH,
): string | URL {
  return path;
}

export async function loadGraveshiftConfig(path?: string | URL): Promise<GraveshiftConfig> {
  const target = resolveConfigPath(path);
  const label = typeof target === 'string' ? target : target.pathname;
  let raw: unknown;
  try {
    raw = Bun.YAML.parse(await Bun.file(target).text());
  } catch (error) {
    throw new GraveshiftConfigError(`Cannot read config at ${label}: ${String(error)}`);
  }
  const parsed = GraveshiftConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new GraveshiftConfigError(
    `Invalid config at ${label}: ${parsed.error.issues.map((issue) => `${z.core.toDotPath(issue.path) || '<root>'}: ${issue.message}`).join('; ')}`,
  );
}

export function parseGraveshiftConfig(raw: unknown): GraveshiftConfig {
  const parsed = GraveshiftConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new GraveshiftConfigError(
    `Invalid config: ${parsed.error.issues.map((issue) => `${z.core.toDotPath(issue.path) || '<root>'}: ${issue.message}`).join('; ')}`,
  );
}
