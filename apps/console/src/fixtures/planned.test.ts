import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import {
  emptyArtifactPanel,
  plannedAgentPage,
  plannedAgentSheet,
  plannedArtifactPanel,
  unavailableArtifactPanel,
} from './agent';
import { sampleCredentials } from './credentials';
import { plannedIntegrations } from './integrations';
import { PLANNED_DEMO_NOTICE } from './sample';
import { plannedWorkflowDesigner, plannedWorkflows } from './workflows';

const timestampSchema = z.iso.datetime();

const messageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(['user', 'agent']),
    body: z.string().min(1),
    createdAt: timestampSchema,
  })
  .strict();

const activitySchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['progress', 'question', 'human_review', 'result']),
    label: z.string().min(1),
    detail: z.string().min(1),
    state: z.enum(['pending', 'complete', 'failed']),
    createdAt: timestampSchema,
  })
  .strict();

const artifactSchema = z
  .object({
    id: z.string().min(1),
    kind: z.literal('document'),
    title: z.string().min(1),
    filename: z.string().min(1),
    summary: z.string().min(1),
    content: z.string(),
    sourceMessageId: z.string().min(1),
    status: z.enum(['ready', 'unavailable']),
    createdAt: timestampSchema,
  })
  .strict();

const artifactPanelSchema = z
  .object({
    artifacts: z.array(artifactSchema),
    selectedArtifactId: z.string().min(1).nullable(),
  })
  .strict();

const agentSheetSchema = z
  .object({
    mode: z.literal('sheet'),
    showContextPanel: z.literal(false),
    conversation: z.array(messageSchema),
    activities: z.array(activitySchema),
  })
  .strict();

const agentPageSchema = z
  .object({
    mode: z.literal('full_screen'),
    showContextPanel: z.literal(true),
    conversation: z.array(messageSchema),
    activities: z.array(activitySchema),
    contextPanel: z.literal('artifacts'),
    artifactPanelId: z.string().min(1),
  })
  .strict();

const integrationSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.enum(['event_source', 'source_control', 'notification']),
    status: z.enum(['connected', 'disconnected', 'attention_required']),
    summary: z.string().min(1),
    credentialId: z.string().min(1).nullable(),
    lastCheckedAt: timestampSchema.nullable(),
  })
  .strict();

const workflowStepSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['trigger', 'inspect', 'notify', 'human_review']),
    title: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();

const workflowSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    status: z.enum(['draft', 'published', 'invalid']),
    version: z.number().int().min(1),
    steps: z.array(workflowStepSchema),
    validation: z.array(z.string().min(1)),
    updatedAt: timestampSchema,
  })
  .strict();

const workflowDesignerSchema = z
  .object({
    workflowId: z.string().min(1),
    selectedStepId: z.string().min(1),
    validation: z.array(z.string().min(1)),
  })
  .strict();

function expectPlanned(sample: { sample: boolean; origin: string; notice: string }): void {
  expect(sample.sample).toBe(true);
  expect(sample.origin).toBe('planned_demo');
  expect(sample.notice).toBe(PLANNED_DEMO_NOTICE);
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, keys);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      keys.add(key);
      collectKeys(entry, keys);
    }
  }
  return keys;
}

describe('planned Agent Workspace fixtures', () => {
  test('sheet, page, and artifact panels match their explicit demo schemas', () => {
    expectPlanned(plannedAgentSheet);
    expect(agentSheetSchema.parse(plannedAgentSheet.payload)).toEqual(plannedAgentSheet.payload);
    expectPlanned(plannedAgentPage);
    expect(agentPageSchema.parse(plannedAgentPage.payload)).toEqual(plannedAgentPage.payload);
    for (const panel of [plannedArtifactPanel, emptyArtifactPanel, unavailableArtifactPanel]) {
      expectPlanned(panel);
      expect(artifactPanelSchema.parse(panel.payload)).toEqual(panel.payload);
    }
  });

  test('artifact links stay inside the sample conversation and page', () => {
    const messageIds = new Set(plannedAgentSheet.payload.conversation.map((message) => message.id));
    for (const artifact of plannedArtifactPanel.payload.artifacts) {
      expect(messageIds.has(artifact.sourceMessageId)).toBe(true);
    }
    expect(plannedAgentPage.payload.artifactPanelId).toBe(plannedArtifactPanel.id);
    expect(plannedAgentSheet.payload.showContextPanel).toBe(false);
  });
});

describe('planned integration and workflow fixtures', () => {
  test('integrations and workflows match their explicit demo schemas', () => {
    for (const integration of plannedIntegrations) {
      expectPlanned(integration);
      expect(integrationSchema.parse(integration.payload)).toEqual(integration.payload);
    }
    for (const workflow of plannedWorkflows) {
      expectPlanned(workflow);
      expect(workflowSchema.parse(workflow.payload)).toEqual(workflow.payload);
    }
    expectPlanned(plannedWorkflowDesigner);
    expect(workflowDesignerSchema.parse(plannedWorkflowDesigner.payload)).toEqual(
      plannedWorkflowDesigner.payload,
    );
  });

  test('references stay inside the planned fixture sets', () => {
    const credentialIds = new Set(sampleCredentials.map((credential) => credential.payload.id));
    for (const integration of plannedIntegrations) {
      const credentialId = integration.payload.credentialId;
      if (credentialId !== null) expect(credentialIds.has(credentialId)).toBe(true);
    }
    const workflow = plannedWorkflows.find(
      (candidate) => candidate.payload.id === plannedWorkflowDesigner.payload.workflowId,
    );
    if (workflow === undefined) throw new Error('Missing designer workflow fixture');
    expect(
      workflow.payload.steps.some(
        (step) => step.id === plannedWorkflowDesigner.payload.selectedStepId,
      ),
    ).toBe(true);
  });

  test('planned payloads do not claim backend diagnosis, evidence, endpoints, or permissions', () => {
    const payloads = [
      plannedAgentSheet.payload,
      plannedAgentPage.payload,
      plannedArtifactPanel.payload,
      ...plannedIntegrations.map((integration) => integration.payload),
      ...plannedWorkflows.map((workflow) => workflow.payload),
      plannedWorkflowDesigner.payload,
    ];
    const forbidden = new Set([
      'diagnosis',
      'evidence',
      'endpoint',
      'url',
      'token',
      'secret',
      'hash',
      'prefix',
      'permissions',
      'requiredScopes',
      'authorization',
    ]);
    for (const key of collectKeys(payloads)) expect(forbidden.has(key)).toBe(false);
    expect(JSON.stringify(payloads)).not.toMatch(/https?:\/\//);
  });
});
