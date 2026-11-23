import { createHash } from 'node:crypto';
import type { WorkItem } from '@graveshift/core';
import { WorkError, type WorkCaller, type WorkCommands } from '@graveshift/work';

export function workActivation(commands: WorkCommands, projectId: string) {
  return async (item: WorkItem, incidentId: string): Promise<void> => {
    const identity = createHash('sha256')
      .update(JSON.stringify([projectId, incidentId]))
      .digest('hex');
    const caller: WorkCaller = {
      projectId,
      actor: 'wraith',
      commandId: `haunting:${identity}:assignment`,
      expectedVersion: 0,
    };
    try {
      await commands.triage(caller, item.id, { assignee: item.assignee });
    } catch (error) {
      if (error instanceof WorkError && error.code === 'STATE_CHANGED') return;
      throw error;
    }
  };
}
