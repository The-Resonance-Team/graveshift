import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException, Injectable } from '@nestjs/common';

/**
 * The Project of the authenticated caller. The bearer guard enters the value
 * for the current async request chain. A singleton is required: @nestjs/mcp
 * refuses request-scoped tools, resources and prompts.
 */
@Injectable()
export class McpProjectContext {
  private readonly storage = new AsyncLocalStorage<string>();

  enter(projectId: string): void {
    this.storage.enterWith(projectId);
  }

  get projectId(): string | undefined {
    return this.storage.getStore();
  }

  require(): string {
    const projectId = this.projectId;
    if (projectId === undefined)
      throw new ForbiddenException('An authenticated Project is required');
    return projectId;
  }
}
