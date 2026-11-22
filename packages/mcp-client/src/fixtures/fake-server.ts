import { McpServer, ProtocolError, ResourceTemplate } from '@modelcontextprotocol/server';

import {
  MCP_SERVER_INFO,
  POSTMORTEM_MIME_TYPE,
  POSTMORTEM_URI_TEMPLATE,
  PROMPT_SPECS,
  TOOL_SPECS,
} from '../catalog';
import {
  FAKE_AUDIT,
  FAKE_INCIDENT_VIEWS,
  FAKE_METRIC_VALUE,
  FAKE_POSTMORTEM,
  FAKE_SERVICES,
  fakeIncidentView,
  fakeLogText,
  fakeProposeFixResult,
} from './data';

/**
 * A fake MCP server for tests. It registers the same primitive names,
 * descriptions and input schemas as `apps/api/src/mcp`, answers from the
 * fixtures in `./data`, and never touches a live endpoint or a secret store.
 * No network call happens: callers connect it over in-memory transports.
 */

const RESOURCE_NOT_FOUND = -32002;

function jsonResult(value: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

function errorResult(text: string): {
  content: [{ type: 'text'; text: string }];
  isError: true;
} {
  return { content: [{ type: 'text' as const, text }], isError: true as const };
}

export interface FakeMcpServer {
  server: McpServer;
  /** Count of JSON-RPC requests the server accepted. */
  readonly requestCount: () => number;
  close: () => Promise<void>;
}

/** Registers the nine tools, the two prompts and the postmortem resource. */
export function createFakeMcpServer(): FakeMcpServer {
  const server = new McpServer(MCP_SERVER_INFO);
  let requests = 0;

  for (const spec of TOOL_SPECS) {
    const handler = (args: Record<string, unknown> | undefined) => {
      requests += 1;
      return handleTool(spec.name, args ?? {});
    };
    const inputSchema = 'inputSchema' in spec ? spec.inputSchema : undefined;
    if (inputSchema) {
      server.registerTool(
        spec.name,
        { description: spec.description, inputSchema },
        async (args: unknown) => handler((args ?? {}) as Record<string, unknown>),
      );
    } else {
      server.registerTool(spec.name, { description: spec.description }, async () => handler({}));
    }
  }

  for (const spec of PROMPT_SPECS) {
    server.registerPrompt(
      spec.name,
      { description: spec.description, argsSchema: spec.argsSchema },
      async (args) => {
        requests += 1;
        const incidentId = String((args as { incidentId?: unknown }).incidentId ?? '');
        const text =
          spec.name === 'triage_incident'
            ? `Triage incident ${incidentId}. Call get_incident, get_diagnosis and get_audit_log.`
            : `Write the Autopsy for incident ${incidentId}. Read the resource ${POSTMORTEM_URI_TEMPLATE}.`;
        return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] };
      },
    );
  }

  server.registerResource(
    'postmortem',
    new ResourceTemplate(POSTMORTEM_URI_TEMPLATE, { list: undefined }),
    { description: 'Postmortem for an incident.', mimeType: POSTMORTEM_MIME_TYPE },
    async (uri, variables) => {
      requests += 1;
      const id = decodeURIComponent(String(variables.id ?? ''));
      if (!fakeIncidentView(id)) {
        throw new ProtocolError(RESOURCE_NOT_FOUND, 'resource not found');
      }
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: POSTMORTEM_MIME_TYPE,
            text: FAKE_POSTMORTEM,
          },
        ],
      };
    },
  );

  return {
    server,
    requestCount: () => requests,
    close: async () => {
      await server.close();
    },
  };
}

function handleTool(
  name: string,
  args: Record<string, unknown>,
): ReturnType<typeof jsonResult> | ReturnType<typeof errorResult> {
  switch (name) {
    case 'list_services':
      return jsonResult([...FAKE_SERVICES]);
    case 'list_incidents':
      return jsonResult(FAKE_INCIDENT_VIEWS.slice(0, Number(args.limit ?? 20)));
    case 'get_incident': {
      const view = fakeIncidentView(String(args.id ?? ''));
      return view ? jsonResult(view) : errorResult('incident not found');
    }
    case 'get_diagnosis': {
      const view = fakeIncidentView(String(args.id ?? ''));
      if (!view) return errorResult('incident not found');
      const diagnosis = (view.incident as { diagnosis?: unknown }).diagnosis;
      return diagnosis ? jsonResult(diagnosis) : errorResult('no diagnosis yet');
    }
    case 'get_audit_log':
      return jsonResult(FAKE_AUDIT.filter((entry) => entry.seq > Number(args.afterSeq ?? 0)));
    case 'verify_audit_chain':
      return jsonResult({ ok: true, length: FAKE_AUDIT.length });
    case 'propose_fix': {
      if (!fakeIncidentView(String(args.incidentId ?? '')))
        return errorResult('incident not found');
      return jsonResult(fakeProposeFixResult(String(args.action ?? '')));
    }
    case 'tail_logs':
      return { content: [{ type: 'text' as const, text: fakeLogText() }] };
    case 'query_metric': {
      const promql = String(args.promql ?? '');
      if (/\boffset\b/.test(promql)) return errorResult('forbidden syntax');
      return jsonResult({ value: FAKE_METRIC_VALUE });
    }
    default:
      return errorResult(`unknown tool ${name}`);
  }
}
