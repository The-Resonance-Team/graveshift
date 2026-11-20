import {
  type AgentConfig,
  declaredParams,
  fillAgentPrompt,
  paramDefaults,
  selectAgentByKeywords,
} from './config';
import { UNTRUSTED_SYSTEM_NOTE, untrustedRequest } from './untrusted';

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
      const defaults = paramDefaults(agent);
      const effective: Record<string, string> = {};
      const missing: string[] = [];
      for (const name of declaredParams(agent)) {
        const fromRequest = supplied[name];
        const value =
          typeof fromRequest === 'string' && fromRequest.length > 0 ? fromRequest : defaults[name];
        if (value === undefined || value.length === 0) {
          missing.push(name);
        } else {
          effective[name] = value;
        }
      }

      if (missing.length > 0) {
        if (request.alreadyAsked === true) {
          return {
            kind: 'needs_human',
            reason: `missing required params after one question: ${missing.join(', ')}`,
            missing,
          };
        }
        const question = await model.generateText({
          system: [
            'You are the Graveshift routing agent. Ask the user once for the missing params.',
            UNTRUSTED_SYSTEM_NOTE,
          ].join('\n'),
          prompt: `Agent ${agent.name} needs ${missing.join(', ')}. Request:\n${untrustedRequest(request.text)}`,
        });
        return { kind: 'ask', agent, question, missing };
      }

      return { kind: 'routed', agent, prompt: fillAgentPrompt(agent.prompt, effective) };
    },
  };
}
