import { z } from 'zod';

// Response descriptions for OpenAPI only. Request bodies use class-validator DTOs.

const roleSchema = z.enum(['owner', 'member']);

export const accountSchema = z.object({
  id: z.string(),
  email: z.string(),
  mustChangePassword: z.boolean(),
  organizations: z.array(z.object({ orgId: z.string(), role: roleSchema })),
});

export const loginSchema = z.object({ access_token: z.string() });

export const onboardingSchema = accountSchema;

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.iso.datetime(),
});

export const projectSchema = z.object({
  projectId: z.string(),
  orgId: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.iso.datetime(),
});

export const projectListSchema = z.array(projectSchema);

export const oauthClientSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  projectId: z.string(),
});
