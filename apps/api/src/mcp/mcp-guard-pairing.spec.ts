import 'reflect-metadata';
import { type ExecutionContext, type DynamicModule, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { describe, expect, test } from 'bun:test';

import type { CredentialService } from '../auth/services/credential.service';
import { McpHttpScopeGuard } from './mcp-http-scope.guard';
import { McpScopeGuard } from './mcp-scope.guard';
import { McpBearerGuard } from './mcp-token.verifier';
import { GraveshiftMcpModule } from './mcp.module';
import { McpTools } from './mcp.tools';

interface BearerRequest {
  headers?: { authorization?: string };
  authInfo?: { scopes: string[]; projectId: string };
  mcpPrincipal?: { scopes: string[] };
}

const httpGuards = (): unknown[] => {
  const imports = Reflect.getMetadata('imports', GraveshiftMcpModule) as unknown[];
  const dynamic = imports.find(
    (entry): entry is DynamicModule =>
      typeof entry === 'object' && entry !== null && 'controllers' in entry,
  );
  return (dynamic?.controllers ?? []).flatMap(
    (controller) => (Reflect.getMetadata(GUARDS_METADATA, controller) ?? []) as unknown[],
  );
};

const mcpContext = (request?: BearerRequest, name = 'propose_fix'): ExecutionContext => {
  const host = new ExecutionContextHost([
    {},
    { kind: 'tool', name, ...(request === undefined ? {} : { request }) },
  ]);
  host.setType('rpc');
  return host;
};

describe('MCP guard pairing', () => {
  test('the scope guard fails open without authInfo, as stdio requires', () => {
    expect(new McpScopeGuard().canActivate(mcpContext())).toBe(true);
  });

  test('the HTTP MCP controller pairs McpBearerGuard with the scope guards', () => {
    const guards = httpGuards();
    expect(guards).toContain(McpBearerGuard);
    expect(guards).toContain(McpHttpScopeGuard);
    expect(guards.indexOf(McpBearerGuard)).toBeLessThan(guards.indexOf(McpHttpScopeGuard));
    expect(Reflect.getMetadata(GUARDS_METADATA, McpTools)).toContain(McpScopeGuard);
  });

  test('the bearer guard populates the authInfo that the scope guard enforces', async () => {
    const request: BearerRequest = { headers: { authorization: 'Bearer scoped-token' } };
    const credentials = {
      verify: async (_token: string, kind: string) => {
        expect(kind).toBe('mcp');
        return { clientId: 'client-1', projectId: 'project-1', scopes: ['incidents:read'] };
      },
    } as unknown as CredentialService;
    const http = new ExecutionContextHost([request, { setHeader() {} }]);
    http.setType('http');

    expect(await new McpBearerGuard(credentials).canActivate(http)).toBe(true);
    expect(request.authInfo).toMatchObject({ scopes: ['incidents:read'], projectId: 'project-1' });
    expect(() => new McpScopeGuard().canActivate(mcpContext(request))).toThrow(ForbiddenException);
    expect(new McpScopeGuard().canActivate(mcpContext())).toBe(true);
  });
});
