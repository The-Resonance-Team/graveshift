import { processQueued, publishSubject } from '@graveshift/events';
import { describe, expect, test } from 'bun:test';

import { dbTestEnabled } from '../../api/test/database/fixtures';
import { setupFlow } from './flow.fixture';
import { agent, caller, envelope } from './flow-fixtures';
import { PLATFORM_AGENTS, TEST_BASE_SHA } from './platform.fixture';

describe.skipIf(!dbTestEnabled)('queued observation activation over Postgres', () => {
  test('a queued Haunting activates its Agent assignment before acknowledgement', async () => {
    const flow = await setupFlow({
      agents: [agent({ autoFix: true }), ...PLATFORM_AGENTS.slice(1)],
    });
    try {
      await flow.db.organization.create({ data: { name: 'Platform', slug: 'platform' } });
      await flow.db.project.create({
        data: {
          projectId: caller.projectId,
          orgId: (await flow.db.organization.findFirstOrThrow()).id,
          name: 'Platform',
          slug: 'platform',
        },
      });
      await flow.db.deploy.create({
        data: {
          projectId: caller.projectId,
          environment: 'production',
          deploymentId: TEST_BASE_SHA,
          title: 'platform-deploy',
          dateStarted: new Date('2026-11-21T10:00:00.000Z'),
        },
      });
      const observe = await flow.platform.observe();
      const acknowledgements: string[] = [];
      const delivery = {
        data: new TextEncoder().encode(JSON.stringify(envelope)),
        subject: publishSubject(envelope),
        term: () => acknowledgements.push('term'),
        working: () => {},
        nak: () => acknowledgements.push('nak'),
        ackAck: async () => {
          expect(await flow.db.fixAttempt.findFirst()).toMatchObject({
            state: 'completed',
            trigger: 'auto_fix',
          });
          acknowledgements.push('ack');
          return true;
        },
      };
      await processQueued(delivery, observe, { grantedProjectIds: [caller.projectId] });
      expect(acknowledgements).toEqual(['ack']);
      expect(await flow.db.workItem.count()).toBe(2);
      expect(await flow.db.auditEntry.count({ where: { type: 'deployment.closed' } })).toBe(1);
    } finally {
      await flow.close();
    }
  });
});
