import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { McpStdioServer } from '@nestjs/mcp';
import { ProtocolError, type McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { CredentialService } from '../../auth/services/credential.service';
import { EventPollService } from './events.service';

const UNSUPPORTED = -32026;
const FORBIDDEN = -32024;
const EXTENSION = 'io.modelcontextprotocol/events';

/** Thrown at boot when the SDK no longer exposes the factory field we wrap. */
export class EventsBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventsBridgeError';
  }
}

const listParams = z.object({}).loose();
const listResult = z.object({ resultType: z.literal('complete'), events: z.array(z.unknown()) });
const pollParams = z
  .object({
    name: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()).optional(),
    cursor: z.string().nullable().optional(),
    maxAgeMs: z.number().int().nonnegative().optional(),
    maxEvents: z.number().int().optional(),
  })
  .loose();
const pollResult = z.object({ resultType: z.literal('complete'), events: z.array(z.unknown()) });
const unimplementedParams = z.object({}).loose();
const unimplementedResult = z.object({ resultType: z.literal('complete') });

interface ServingLike {
  era: 'legacy' | 'modern';
  transport: 'http' | 'stdio';
  authInfo?: { scopes?: readonly string[]; tenantId?: string } | undefined;
  request?: unknown;
}

interface EventCaller {
  scopes: readonly string[];
  tenantId?: string;
}

interface FactoryLike {
  create(serving: ServingLike): McpServer;
}

/** Read the scopes from the SDK auth info or the bearer header on this request. */
async function resolveCaller(
  serving: ServingLike,
  credentials: CredentialService,
): Promise<EventCaller> {
  if (serving.authInfo?.tenantId) {
    return {
      scopes: serving.authInfo.scopes ?? [],
      tenantId: serving.authInfo.tenantId,
    };
  }
  const request = serving.request as { headers?: Record<string, string> } | undefined;
  const header = request?.headers?.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token) return { scopes: [] };
  try {
    const credential = await credentials.verify(token, 'mcp');
    return { scopes: credential.scopes, tenantId: credential.tenantId };
  } catch {
    return { scopes: [] };
  }
}

/** Register all five Events methods on one SDK server. Push and webhook are v3 stubs. */
export function registerEvents(
  server: McpServer,
  service: EventPollService,
  getCaller: () => Promise<EventCaller>,
): void {
  const low = server.server;
  low.registerCapabilities({ extensions: { [EXTENSION]: { listChanged: false } } });

  low.setRequestHandler('events/list', { params: listParams, result: listResult }, async () => {
    if (!(await getCaller()).tenantId) {
      throw new ProtocolError(FORBIDDEN, 'Forbidden', { reason: 'authentication' });
    }
    return service.list();
  });
  low.setRequestHandler(
    'events/poll',
    { params: pollParams, result: pollResult },
    async (params) => {
      const caller = await getCaller();
      if (!caller.tenantId) {
        throw new ProtocolError(FORBIDDEN, 'Forbidden', { reason: 'authentication' });
      }
      return service.poll(params, caller.scopes, caller.tenantId);
    },
  );

  const unsupported = (feature: string) => () => {
    throw new ProtocolError(UNSUPPORTED, 'Unsupported', {
      feature: 'deliveryMode',
      value: feature,
    });
  };
  low.setRequestHandler(
    'events/stream',
    { params: unimplementedParams, result: unimplementedResult },
    unsupported('push'),
  );
  low.setRequestHandler(
    'events/subscribe',
    { params: unimplementedParams, result: unimplementedResult },
    unsupported('webhook'),
  );
  low.setRequestHandler(
    'events/unsubscribe',
    { params: unimplementedParams, result: unimplementedResult },
    unsupported('webhook'),
  );
}

/**
 * Patches the one factory shared by the HTTP and stdio entries of the module.
 * @nestjs/mcp 0.0.4 has no supported hook for custom JSON-RPC methods and does
 * not export the factory, so reach it through the exported stdio server.
 */
@Injectable()
export class EventsBridge implements OnModuleInit {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly service: EventPollService,
    private readonly credentials: CredentialService,
  ) {}

  onModuleInit(): void {
    const stdio = this.moduleRef.get(McpStdioServer, { strict: false });
    // Adapter boundary: `factory` is private in the SDK type but public at runtime.
    const factory = (stdio as unknown as { factory?: FactoryLike }).factory;
    if (typeof factory?.create !== 'function') {
      throw new EventsBridgeError(
        'McpServerFactory.create is missing; @nestjs/mcp internals changed. Review the Events bridge.',
      );
    }
    const original = factory.create.bind(factory);
    // ponytail: wrap the factory until @nestjs/mcp exports a request-handler hook; upgrade when that hook ships.
    factory.create = (serving: ServingLike): McpServer => {
      const server = original(serving as Parameters<FactoryLike['create']>[0]);
      if (serving.era === 'modern') {
        registerEvents(server, this.service, () => resolveCaller(serving, this.credentials));
      }
      return server;
    };
  }
}
