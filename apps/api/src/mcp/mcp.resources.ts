import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ResourceTemplate } from '@nestjs/mcp';

import { deepRedact } from './mcp.redact';
import { writeAutopsy } from './mcp.postmortem';
import { MCP_BACKEND, type McpBackend } from './mcp.types';

/** The postmortem resource reads the same backend as the tools. */
@Injectable()
export class McpResources {
  constructor(@Inject(MCP_BACKEND) private readonly backend: McpBackend) {}

  @ResourceTemplate({
    uriTemplate: 'graveshift://incidents/{id}/postmortem',
    name: 'Autopsy',
    description: 'Postmortem for an incident.',
    mimeType: 'text/markdown',
  })
  async postmortem({ id }: { id: string }): Promise<string> {
    let incidentId: string;
    try {
      incidentId = decodeURIComponent(id);
    } catch {
      throw new NotFoundException('resource not found');
    }
    const view = await this.backend.getIncident(incidentId);
    if (!view) throw new NotFoundException();
    return deepRedact(writeAutopsy(view));
  }
}
