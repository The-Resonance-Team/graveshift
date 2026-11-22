import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/client';
import { z } from 'zod';

import { GraveshiftMcpValidationError } from './errors';

/**
 * Reply decoding helpers. The API answers tools with JSON inside one text
 * content block, and prompts with string arguments; these keep that contract
 * in one place.
 */

export function firstTextBlock(result: CallToolResult, label: string): string {
  const content = result.content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === 'text' && typeof block.text === 'string') return block.text;
    }
  }
  throw new GraveshiftMcpValidationError(`${label}: expected one text reply`);
}

/** Parse the JSON text a tool replies with, then check it against the contract. */
export function parseToolReply<T>(name: string, text: string, schema: z.ZodType<T>): T {
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch (error) {
    throw new GraveshiftMcpValidationError(`tool ${name}: expected a JSON text reply`, {
      cause: error,
    });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new GraveshiftMcpValidationError(`tool ${name}: reply does not match the contract`, {
      issues: parsed.error.issues,
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/** The MCP spec carries prompt arguments as strings; the catalog schemas only allow strings. */
export function promptArgsToStrings(args: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [key, String(value)]));
}

/** Take the single text content of a postmortem reply and check its mime type. */
export function singleTextResource(
  result: ReadResourceResult,
  uri: string,
  mimeType: string,
): string {
  const contents = result.contents;
  const only = Array.isArray(contents) ? contents[0] : undefined;
  if (!only || contents.length !== 1) {
    throw new GraveshiftMcpValidationError(`readResource ${uri}: expected exactly one content`);
  }
  if (only.mimeType !== undefined && only.mimeType !== mimeType) {
    throw new GraveshiftMcpValidationError(`readResource ${uri}: expected ${mimeType}`);
  }
  if (typeof (only as { text?: unknown }).text !== 'string') {
    throw new GraveshiftMcpValidationError(`readResource ${uri}: expected a text resource`);
  }
  return (only as { text: string }).text;
}
