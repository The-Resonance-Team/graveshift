import type { ChatTransport, UIMessageChunk } from 'ai';

import type { SampleMessage } from './agent-fixtures';

/**
 * Local-only fixture transport for the planned Agent Workspace.
 * It never fetches, generates, persists, or calls an Agent. Closing an empty
 * stream lets useChat finish the turn with the user's local sample input only.
 */
class LocalFixtureTransport implements ChatTransport<SampleMessage> {
  async sendMessages(): Promise<ReadableStream<UIMessageChunk>> {
    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.close();
      },
    });
  }

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  }
}

export const localFixtureTransport = new LocalFixtureTransport();
