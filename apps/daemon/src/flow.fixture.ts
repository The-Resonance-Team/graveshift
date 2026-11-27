import { openTestDatabase, resetDatabase, workItemData } from '../../api/test/database/fixtures';
import { caller, context } from './flow-fixtures';
import { createPlatform, type PlatformConfig } from './platform.fixture';
import { spyWorkRuntime } from './runtime.spy';
import { createWorkCommands, type WorkFlowOptions } from './work-flow';

export interface FlowSetup extends PlatformConfig {
  seed?: string | false;
}

/** One throwaway Postgres platform per suite element, with an observed real WorkRuntime. */
export async function setupFlow(config: FlowSetup = {}) {
  const db = await openTestDatabase();
  await resetDatabase(db);
  let platform: Awaited<ReturnType<typeof createPlatform>>;
  try {
    platform = await createPlatform(db, config);
    if (typeof config.seed === 'string') await platform.seed(config.seed);
    else if (config.seed !== false) await platform.seed();
  } catch (error) {
    await db.onModuleDestroy();
    throw error;
  }
  const spy = spyWorkRuntime(platform.options.runtime);
  const options: WorkFlowOptions = { ...platform.options, runtime: spy.runtime };
  return {
    db,
    platform,
    options,
    calls: spy.calls,
    async seedIn(projectId: string, id: string) {
      await db.workItem.create({
        data: {
          ...workItemData(projectId, id),
          assignee: 'needs_agent_Assigned Agent',
          service: 'checkout',
          diagnosis: context().diagnosis,
        },
      });
    },
    commands: (extra: Partial<WorkFlowOptions> = {}) =>
      createWorkCommands({ ...options, ...extra }),
    read: () => spy.runtime.read({ projectId: caller.projectId, id: 'work-1' }),
    close: async () => {
      await platform.close();
      await db.onModuleDestroy();
    },
  };
}
