import { z } from 'zod';

// Zod schemas here describe OpenAPI responses only. They do not validate requests.
const credentialMetadataSchema = z.object({
  id: z.string(),
  kind: z.enum(['mcp', 'plugin']),
  name: z.string(),
  scopes: z.array(z.string()),
  service: z.string().nullable(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
});

export const issuedCredentialSchema = credentialMetadataSchema.extend({
  prefix: z.string(),
  value: z.string(),
});

export const credentialListSchema = z.object({
  items: z.array(credentialMetadataSchema),
});

export const eventAcceptedSchema = z.object({
  accepted: z.literal(true),
  id: z.string(),
});
