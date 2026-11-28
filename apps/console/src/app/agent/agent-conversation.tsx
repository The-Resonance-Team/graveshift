import { Avatar } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import {
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatMessageMetadata,
  ChatSystemMessage,
  ChatToolCalls,
} from '@astryxdesign/core/Chat';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import { Token } from '@astryxdesign/core/Token';

import { fixtureMessages, isLocalMessage, sampleToolCalls } from './agent-fixtures';

type SampleMessage = (typeof fixtureMessages)[number];

function renderAvatar() {
  return <Avatar name="Agent" size="sm" />;
}

function renderTimestamp(value: string) {
  return <Timestamp value={value} format="time" />;
}

function renderMetadata(createdAt: string) {
  return <ChatMessageMetadata timestamp={renderTimestamp(createdAt)} />;
}

function messageText(message: SampleMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

export function AgentConversation({
  messages,
  onApprovalPreview,
}: {
  messages: readonly SampleMessage[];
  onApprovalPreview: () => void;
}) {
  if (messages.length === 0) {
    return (
      <ChatMessageList align="top">
        <ChatSystemMessage>
          Local sample chat cleared. No Agent is connected. Add local sample input below.
        </ChatSystemMessage>
      </ChatMessageList>
    );
  }

  return (
    <ChatMessageList align="top" gap={3}>
      <ChatSystemMessage variant="divider">
        Sample conversation, local preview only
      </ChatSystemMessage>
      {messages.map((message) => (
        <VStack key={message.id} as="div" id={`message-${message.id}`} gap={0}>
          <ChatMessage
            sender={message.role === 'user' ? 'user' : 'assistant'}
            avatar={message.role === 'assistant' ? renderAvatar() : undefined}
          >
            <ChatMessageBubble
              metadata={
                message.metadata?.createdAt ? renderMetadata(message.metadata.createdAt) : undefined
              }
            >
              {isLocalMessage(message) ? (
                <HStack gap={2} wrap="wrap">
                  <Token label="Local sample input" />
                  <Text>{messageText(message)}</Text>
                </HStack>
              ) : (
                <Text>{messageText(message)}</Text>
              )}
            </ChatMessageBubble>
            {message.id === 'message-3' ? (
              <ChatSystemMessage>Saved question. No answer was generated.</ChatSystemMessage>
            ) : null}
          </ChatMessage>
        </VStack>
      ))}
      <ChatSystemMessage variant="divider">Sample activity</ChatSystemMessage>
      <ChatMessage sender="assistant" avatar={renderAvatar()}>
        <ChatMessageBubble variant="ghost">
          <Text color="secondary">Sample progress and tool calls. Nothing ran.</Text>
          <ChatToolCalls calls={sampleToolCalls} defaultIsExpanded />
        </ChatMessageBubble>
      </ChatMessage>
      <ChatSystemMessage>
        Human review is requested in the sample. No approval exists in this preview.
      </ChatSystemMessage>
      <Button label="Preview task approval" size="sm" onClick={onApprovalPreview} />
    </ChatMessageList>
  );
}
