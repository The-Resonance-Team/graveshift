import { describe, expect, test } from 'bun:test';

import {
  type RuntimeEvent,
  RuntimeEventSchema,
  type RuntimeSource,
  ServiceHealthSchema,
  ServiceInfoSchema,
} from './runtime-source';

export function runRuntimeSourceContract(
  name: string,
  create: () => RuntimeSource | Promise<RuntimeSource>,
): void {
  describe(`RuntimeSource contract: ${name}`, () => {
    test('listServices returns valid ServiceInfo entries', async () => {
      const source = await create();
      const services = await source.listServices();
      for (const service of services) ServiceInfoSchema.parse(service);
      await source.close();
    });

    test('getHealth returns valid ServiceHealth for each listed service', async () => {
      const source = await create();
      const services = await source.listServices();
      await Promise.all(
        services.map(async ({ name: service }) => {
          const health = ServiceHealthSchema.parse(await source.getHealth(service));
          expect(health.service).toBe(service);
        }),
      );
      await source.close();
    });

    test('tailLogs returns at most the requested number of lines', async () => {
      const source = await create();
      const services = await source.listServices();
      await Promise.all(
        services.map(async ({ name: service }) => {
          const lines = await source.tailLogs(service, 5);
          expect(lines.length).toBeLessThanOrEqual(5);
          for (const line of lines) expect(typeof line).toBe('string');
        }),
      );
      await source.close();
    });

    test('watchEvents delivers only valid events and stops after unsubscribe', async () => {
      const source = await create();
      const events: RuntimeEvent[] = [];
      const stop = await source.watchEvents((event) => events.push(event));
      expect(typeof stop).toBe('function');
      stop();
      const seen = events.length;
      await Bun.sleep(10);
      expect(events.length).toBe(seen);
      for (const event of events) RuntimeEventSchema.parse(event);
      await source.close();
    });

    test('close resolves and may be called twice', async () => {
      const source = await create();
      await source.close();
      await source.close();
    });
  });
}
