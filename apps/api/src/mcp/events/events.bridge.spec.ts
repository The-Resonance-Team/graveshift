import type { ModuleRef } from '@nestjs/core';
import type { McpServer } from '@modelcontextprotocol/server';
import { describe, expect, test } from 'bun:test';

import type { CredentialService } from '../../auth/services/credential.service';
import { EventsBridge, EventsBridgeError, registerEvents } from './events.bridge';
import type { EventPollService } from './events.service';

interface RecordedFactory {
  create(serving: { era: 'legacy' | 'modern'; transport: 'http' | 'stdio' }): McpServer;
}

function makeBridge(factory: unknown): { bridge: EventsBridge; factory: RecordedFactory } {
  const moduleRef = { get: () => ({ factory }) } as unknown as ModuleRef;
  const service = {} as EventPollService;
  const credentials = {} as CredentialService;
  return {
    bridge: new EventsBridge(moduleRef, service, credentials),
    factory: factory as RecordedFactory,
  };
}

describe('EventsBridge', () => {
  test('throws a typed error when the SDK factory is missing', () => {
    const { bridge } = makeBridge({});
    expect(() => bridge.onModuleInit()).toThrow(EventsBridgeError);
  });

  test('registers five methods on the modern server and none on legacy', () => {
    const methods: string[] = [];
    const low = {
      registerCapabilities: () => undefined,
      setRequestHandler: (method: string) => methods.push(method),
    };
    const server = { server: low } as unknown as McpServer;
    const original = () => server;
    const { bridge, factory } = makeBridge({ create: original });

    bridge.onModuleInit();
    expect(factory.create).not.toBe(original);
    factory.create({ era: 'legacy', transport: 'http' });
    expect(methods).toEqual([]);
    factory.create({ era: 'modern', transport: 'http' });
    expect(methods).toEqual([
      'events/list',
      'events/poll',
      'events/stream',
      'events/subscribe',
      'events/unsubscribe',
    ]);
  });

  test('requires authentication for events/list and project scope for events/poll', async () => {
    const handlers = new Map<string, (...args: never[]) => unknown>();
    const server = {
      server: {
        registerCapabilities: () => undefined,
        setRequestHandler: (
          method: string,
          _schema: unknown,
          handler: (...args: never[]) => unknown,
        ) => handlers.set(method, handler),
      },
    } as unknown as McpServer;
    const service = {
      list: () => ({ resultType: 'complete' as const, events: [] }),
      poll: (_params: unknown, scopes: readonly string[], projectId: string) =>
        Promise.resolve({ scopes, projectId }),
    } as unknown as EventPollService;
    registerEvents(server, service, async () => ({ scopes: [] }));
    const list = handlers.get('events/list')!;
    await expect(list()).rejects.toMatchObject({ code: -32024 });
    const poll = handlers.get('events/poll')!;
    await expect(poll({ name: 'incident.changed' } as never)).rejects.toMatchObject({
      code: -32024,
    });
  });
});
