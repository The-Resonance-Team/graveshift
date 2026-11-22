import 'reflect-metadata';
import { z } from 'zod';

import {
  GRAVESHIFT_MCP_CATALOG,
  type PromptSpec,
  type ResourceTemplateSpec,
  type ToolSpec,
} from './catalog';
import { GraveshiftMcpConfigError } from './errors';

/**
 * Drift check. The API in `apps/api/src/mcp` is the authority for the primitive
 * set. This file reads the `@Tool()`, `@Prompt()` and `@ResourceTemplate()`
 * metadata from the API's provider classes and compares it with
 * `GRAVESHIFT_MCP_CATALOG`. `bun run test` and `bun run drift:check` both fail
 * closed when the two disagree.
 */

/** Same key `@nestjs/mcp` writes in `mcp.constants.js` (`MCP_PRIMITIVE_METADATA`). */
const MCP_PRIMITIVE_METADATA = 'nestjs:mcp:primitive';

interface PrimitiveMetadata {
  kind: 'tool' | 'prompt' | 'resource-template';
  options: Record<string, unknown>;
}

export interface ServerToolPrimitive {
  name: string;
  description: string;
  /** The API's zod schema object, kept opaque here. */
  inputSchema: unknown;
}

export interface ServerPromptPrimitive {
  name: string;
  description: string;
  argsSchema: unknown;
}

export interface ServerResourceTemplatePrimitive {
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: string;
}

/** Everything the API registers, read from the provider classes. */
export interface ServerPrimitiveCatalog {
  tools: ServerToolPrimitive[];
  prompts: ServerPromptPrimitive[];
  resourceTemplates: ServerResourceTemplatePrimitive[];
}

export interface PrimitiveMismatch {
  primitive: string;
  field: string;
  expected: string;
  actual: string;
}

export interface DriftReport {
  match: boolean;
  mismatches: PrimitiveMismatch[];
}

function requiredText(options: Record<string, unknown>, field: string, where: string): string {
  const value = options[field];
  if (typeof value !== 'string') {
    throw new GraveshiftMcpConfigError(`drift check: ${where} has no string ${field}`);
  }
  return value;
}

/** Read the MCP metadata the decorators left on every provider method. */
export function collectServerPrimitives(providers: readonly unknown[]): ServerPrimitiveCatalog {
  const catalog: ServerPrimitiveCatalog = { tools: [], prompts: [], resourceTemplates: [] };
  for (const provider of providers) {
    if (typeof provider !== 'function' || provider.prototype === undefined) {
      throw new GraveshiftMcpConfigError('drift check: expected provider classes');
    }
    const className = (provider as { name?: string }).name ?? 'anonymous';
    const prototype = (provider as { prototype: object }).prototype;
    for (const key of Object.getOwnPropertyNames(prototype)) {
      if (key === 'constructor') continue;
      const method = Reflect.get(prototype, key);
      if (typeof method !== 'function') continue;
      const metadata = Reflect.getOwnMetadata(MCP_PRIMITIVE_METADATA, method) as
        | PrimitiveMetadata
        | undefined;
      if (!metadata) continue;
      const where = `${className}.${key}`;
      const options = metadata.options;
      if (metadata.kind === 'tool') {
        catalog.tools.push({
          name: requiredText(options, 'name', where),
          description: requiredText(options, 'description', where),
          inputSchema: options.inputSchema,
        });
      } else if (metadata.kind === 'prompt') {
        catalog.prompts.push({
          name: requiredText(options, 'name', where),
          description: requiredText(options, 'description', where),
          argsSchema: options.argsSchema,
        });
      } else {
        catalog.resourceTemplates.push({
          uriTemplate: requiredText(options, 'uriTemplate', where),
          name: requiredText(options, 'name', where),
          description: requiredText(options, 'description', where),
          mimeType: requiredText(options, 'mimeType', where),
        });
      }
    }
  }
  return catalog;
}

/**
 * Canonical JSON Schema text for a zod schema. Both sides run the same pinned
 * zod version, so the texts are directly comparable. A schema that cannot be
 * serialised is reported as a mismatch, never skipped.
 */
function schemaShape(schema: unknown): string {
  if (schema === undefined) return '<none>';
  try {
    return JSON.stringify(z.toJSONSchema(schema as z.ZodType, { unrepresentable: 'any' }));
  } catch (error) {
    return `<unserializable: ${String(error)}>`;
  }
}

function compareByName<E extends { name: string }, A extends { name: string }>(
  kind: string,
  expected: readonly E[],
  actual: readonly A[],
  fields: (where: string, want: E, got: A) => PrimitiveMismatch[],
  nameOf: (item: E | A) => string,
): PrimitiveMismatch[] {
  const mismatches: PrimitiveMismatch[] = [];
  const actualByName = new Map(actual.map((item) => [nameOf(item), item]));
  const expectedNames = new Set(expected.map((item) => nameOf(item)));
  for (const want of expected) {
    const got = actualByName.get(nameOf(want));
    if (!got) {
      mismatches.push({
        primitive: `${kind} ${nameOf(want)}`,
        field: 'presence',
        expected: 'registered',
        actual: 'missing',
      });
      continue;
    }
    mismatches.push(...fields(`${kind} ${nameOf(want)}`, want, got));
  }
  for (const item of actual) {
    if (!expectedNames.has(nameOf(item))) {
      mismatches.push({
        primitive: `${kind} ${nameOf(item)}`,
        field: 'presence',
        expected: 'not registered',
        actual: 'registered',
      });
    }
  }
  return mismatches;
}

/** Compare the catalog with the API's registration. Pure: no network, no Nest boot. */
export function checkCatalogDrift(
  server: ServerPrimitiveCatalog,
  catalog: {
    tools: readonly ToolSpec[];
    prompts: readonly PromptSpec[];
    resourceTemplates: readonly ResourceTemplateSpec[];
  } = GRAVESHIFT_MCP_CATALOG,
): DriftReport {
  const mismatches: PrimitiveMismatch[] = [];
  mismatches.push(
    ...compareByName(
      'tool',
      catalog.tools,
      server.tools,
      (where, want, got) => {
        const found: PrimitiveMismatch[] = [];
        if (want.description !== got.description) {
          found.push({
            primitive: where,
            field: 'description',
            expected: want.description,
            actual: got.description,
          });
        }
        const expectedSchema = schemaShape(want.inputSchema);
        const actualSchema = schemaShape(got.inputSchema);
        if (expectedSchema !== actualSchema) {
          found.push({
            primitive: where,
            field: 'inputSchema',
            expected: expectedSchema,
            actual: actualSchema,
          });
        }
        return found;
      },
      (item) => item.name,
    ),
  );
  mismatches.push(
    ...compareByName(
      'prompt',
      catalog.prompts,
      server.prompts,
      (where, want, got) => {
        const found: PrimitiveMismatch[] = [];
        if (want.description !== got.description) {
          found.push({
            primitive: where,
            field: 'description',
            expected: want.description,
            actual: got.description,
          });
        }
        const expectedSchema = schemaShape(want.argsSchema);
        const actualSchema = schemaShape(got.argsSchema);
        if (expectedSchema !== actualSchema) {
          found.push({
            primitive: where,
            field: 'argsSchema',
            expected: expectedSchema,
            actual: actualSchema,
          });
        }
        return found;
      },
      (item) => item.name,
    ),
  );
  mismatches.push(
    ...compareByName(
      'resource-template',
      catalog.resourceTemplates,
      server.resourceTemplates,
      (where, want, got) => {
        const found: PrimitiveMismatch[] = [];
        for (const field of ['uriTemplate', 'name', 'description', 'mimeType'] as const) {
          if (want[field] !== got[field]) {
            found.push({ primitive: where, field, expected: want[field], actual: got[field] });
          }
        }
        return found;
      },
      (item) => item.uriTemplate,
    ),
  );
  return { match: mismatches.length === 0, mismatches };
}
