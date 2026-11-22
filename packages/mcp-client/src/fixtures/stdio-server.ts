import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createFakeMcpServer } from './fake-server';

/**
 * Fake MCP server over stdio. Tests spawn this script with
 * `StdioClientTransport` through `fakeStdioTransport()`. It answers from the
 * fixtures in `./data` and makes no network call.
 */
const fake = createFakeMcpServer();
await fake.server.connect(new StdioServerTransport());
