import { type AgentConfig, declaredParams, fillAgentPrompt, selectAgentByKeywords } from './config';

export const ROUTING_AGENT_ROLE = 'routing';

// The only model seam in the routing agent. A fake can implement this offline.
export interface RoutingModel {
  generateText(input: { system: string; prompt: string }): Promise<string>;
}

export interface RoutingRequest {
  text: string;
  params?: Readonly<Record<string, string>>;
  // Set by the caller when the user has already received one question.
  alreadyAsked?: boolean;
}

export type RoutingResult =
  | { kind: 'routed'; agent: AgentConfig; prompt: string }
  | { kind: 'ask'; agent: AgentConfig; question: string; missing: string[] }
  | { kind: 'needs_human'; reason: string; missing: string[] };

export interface RoutingAgent {
  route(request: RoutingRequest): Promise<RoutingResult>;
}

export interface RoutingAgentOptions {
  agents: readonly AgentConfig[];
  model: RoutingModel;
}

export function createRoutingAgent(options: RoutingAgentOptions): RoutingAgent {
  const { agents, model } = options;
  return {
    async route(request) {
      const agent = selectAgentByKeywords(agents, request.text);
      if (agent === undefined) {
        return {
          kind: 'needs_human',
          reason: 'no target agent matches the request keywords',
          missing: [],
        };
      }

      const supplied = request.params ?? {};
      const missing = declaredParams(agent).filter((name) => {
        const value = supplied[name];
        return typeof value !== 'string' || value.length === 0;
      });

      if (missing.length > 0) {
        if (request.alreadyAsked === true) {
          return {
            kind: 'needs_human',
            reason: `missing required params after one question: ${missing.join(', ')}`,
            missing,
          };
        }
        const question = await model.generateText({
          system: 'You are the Graveshift routing agent. Ask the user once for the missing params.',
          prompt: `Agent ${agent.name} needs ${missing.join(', ')}. Request: ${request.text}`,
        });
        return { kind: 'ask', agent, question, missing };
      }

      return { kind: 'routed', agent, prompt: fillAgentPrompt(agent.prompt, supplied) };
    },
  };
}
