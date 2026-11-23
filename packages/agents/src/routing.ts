import { z } from 'zod';

import { declaredParams, fillAgentPrompt, paramDefaults, type AgentConfig } from './config';
import { UNTRUSTED_SYSTEM_NOTE, untrustedRequest } from './untrusted';

export const ROUTING_AGENT_ROLE = 'routing';

export const AgentIdentitySchema = z
  .object({ name: z.string().min(1), slug: z.string().min(1) })
  .strict();
export type AgentIdentity = z.infer<typeof AgentIdentitySchema>;

export interface RoutingModelInput {
  selectedAgent: AgentIdentity;
  system: string;
  prompt: string;
}

export type RoutingModelResult =
  | { status: 'ok'; text: string }
  | { status: 'unavailable'; reason: string };

// The host adapts the shared gateway. This package does not depend on the gateway.
export interface RoutingModel {
  generateText(input: RoutingModelInput): Promise<RoutingModelResult>;
}

export interface RoutingRequest {
  attemptId: string;
  selectedAgent: string;
  text: string;
  params?: Readonly<Record<string, string>>;
}

export const RoutingProgressSchema = z
  .object({
    version: z.literal(1),
    phase: z.literal('awaiting_answer'),
    attemptId: z.string().min(1),
    selectedAgent: AgentIdentitySchema,
    text: z.string(),
    params: z.record(z.string(), z.string()),
    missing: z.array(z.string().min(1)).min(1),
    question: z.string().min(1),
  })
  .strict();
export type RoutingProgress = z.infer<typeof RoutingProgressSchema>;

export interface RoutingAnswer {
  progress: RoutingProgress;
  params: Readonly<Record<string, string>>;
}

export type RoutingResult =
  | { kind: 'routed'; attemptId: string; agent: AgentConfig; prompt: string }
  | {
      kind: 'ask';
      attemptId: string;
      agent: AgentConfig;
      question: string;
      missing: string[];
      progress: RoutingProgress;
    }
  | {
      kind: 'needs_human';
      attemptId: string;
      selectedAgent: string;
      reason: string;
      missing: string[];
    };

export interface RoutingAgent {
  begin(request: RoutingRequest): Promise<RoutingResult>;
  resume(answer: RoutingAnswer): Promise<RoutingResult>;
}

export interface RoutingAgentOptions {
  agents: readonly AgentConfig[];
  model: RoutingModel;
}

function prepare(agent: AgentConfig, params: Readonly<Record<string, string>>) {
  const defaults = paramDefaults(agent);
  const effective: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of declaredParams(agent)) {
    const supplied = params[name];
    const value = supplied?.trim() ? supplied : defaults[name];
    if (value === undefined || value.trim().length === 0) missing.push(name);
    else effective[name] = value;
  }
  return { effective, missing };
}

export function createRoutingAgent({ agents, model }: RoutingAgentOptions): RoutingAgent {
  const human = (
    request: Pick<RoutingRequest, 'attemptId' | 'selectedAgent'>,
    reason: string,
    missing: string[] = [],
  ): RoutingResult => ({
    kind: 'needs_human',
    ...request,
    reason,
    missing,
  });
  return {
    async begin(request) {
      const agent = agents.find(({ name }) => name === request.selectedAgent);
      if (agent === undefined)
        return human(
          { attemptId: request.attemptId, selectedAgent: request.selectedAgent },
          'selected Agent is unavailable',
        );
      const { effective, missing } = prepare(agent, request.params ?? {});
      if (missing.length === 0) {
        return {
          kind: 'routed',
          attemptId: request.attemptId,
          agent,
          prompt: fillAgentPrompt(agent.prompt, effective),
        };
      }
      const selectedAgent = { name: agent.name, slug: agent.slug };
      let response: RoutingModelResult;
      try {
        response = await model.generateText({
          selectedAgent,
          system: `You are the Graveshift routing agent. Ask the user once for the missing params.\n${UNTRUSTED_SYSTEM_NOTE}`,
          prompt: `Required params: ${missing.join(', ')}. Request:\n${untrustedRequest(request.text)}`,
        });
      } catch {
        response = { status: 'unavailable', reason: 'question model failed' };
      }
      if (response.status !== 'ok')
        return human(
          { attemptId: request.attemptId, selectedAgent: request.selectedAgent },
          response.reason,
          missing,
        );
      if (response.text.trim().length === 0)
        return human(
          { attemptId: request.attemptId, selectedAgent: request.selectedAgent },
          'question model returned an empty question',
          missing,
        );
      const progress: RoutingProgress = {
        version: 1,
        phase: 'awaiting_answer',
        attemptId: request.attemptId,
        selectedAgent,
        text: request.text,
        params: effective,
        missing,
        question: response.text,
      };
      return {
        kind: 'ask',
        attemptId: request.attemptId,
        agent,
        question: response.text,
        missing,
        progress,
      };
    },
    async resume({ progress: saved, params }) {
      const progress = RoutingProgressSchema.parse(saved);
      const request = { attemptId: progress.attemptId, selectedAgent: progress.selectedAgent.name };
      const agent = agents.find(
        ({ name, slug }) => name === request.selectedAgent && slug === progress.selectedAgent.slug,
      );
      if (agent === undefined) return human(request, 'selected Agent is unavailable');
      const { effective, missing } = prepare(agent, { ...progress.params, ...params });
      if (missing.length > 0)
        return human(
          request,
          `missing required params after one question: ${missing.join(', ')}`,
          missing,
        );
      return {
        kind: 'routed',
        attemptId: progress.attemptId,
        agent,
        prompt: fillAgentPrompt(agent.prompt, effective),
      };
    },
  };
}
