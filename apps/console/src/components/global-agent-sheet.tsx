'use client';

import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import {
  ChatComposer,
  ChatComposerDrawer,
  ChatComposerInput,
  ChatLayout,
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatSystemMessage,
} from '@astryxdesign/core/Chat';
import { Drawer, DrawerHeader } from '@astryxdesign/core/Drawer';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack, Layout, LayoutContent, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { useCallback, useMemo, useRef, useState } from 'react';

import { plannedAgentSheet, type PlannedMessage } from '../fixtures/agent';
import { SAMPLE_TIMESTAMPS } from '../fixtures/sample';

const FIXTURE = plannedAgentSheet.payload;
const SAMPLE_NOTICE_TEXT =
  'Fixture conversation for design review. No Agent ran, no message was sent, and nothing was saved.';
const COMPOSER_STATUS = {
  type: 'warning',
  message: 'Sample only. Sending and saving are unavailable.',
} as const;

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

export interface GlobalAgentSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  pageLabel: string;
}

function TranscriptRow({ message }: { message: PlannedMessage }) {
  const isLocal = message.id.startsWith('local-');
  const name = isLocal
    ? 'You (local, not sent)'
    : message.role === 'user'
      ? 'You (sample)'
      : 'Agent (sample)';
  const metadata = isLocal
    ? 'Local only, not sent'
    : timeFormat.format(new Date(message.createdAt));

  return (
    <ChatMessage
      sender={message.role === 'user' ? 'user' : 'assistant'}
      name={name}
      metadata={metadata}
    >
      <ChatMessageBubble>{message.body}</ChatMessageBubble>
    </ChatMessage>
  );
}

export function GlobalAgentSheet({ isOpen, onOpenChange, pageLabel }: GlobalAgentSheetProps) {
  const [messages, setMessages] = useState<PlannedMessage[]>(FIXTURE.conversation);
  const [draft, setDraft] = useState('');
  const [isContextInjected, setIsContextInjected] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const localMessageCount = useRef(0);

  const startNewChat = useCallback(() => {
    localMessageCount.current = 0;
    setMessages([]);
    setDraft('');
    setIsContextInjected(false);
    setNotice('New sample chat. It is local to this view only and is not stored.');
  }, []);

  const injectContext = useCallback(() => {
    setIsContextInjected(true);
    setNotice('Current page context added to this local draft. Nothing was sent or saved.');
  }, []);

  const removeContext = useCallback(() => {
    setIsContextInjected(false);
    setNotice('Context removed from this local draft.');
  }, []);

  const handleSubmit = useCallback((value: string) => {
    const body = value.trim();
    if (body === '') return;

    localMessageCount.current += 1;
    const localMessage: PlannedMessage = {
      id: `local-${localMessageCount.current}`,
      role: 'user',
      body,
      createdAt: SAMPLE_TIMESTAMPS.anchor,
    };
    setMessages((current) => [...current, localMessage]);
    setNotice(
      'Local sample message added to this view only. No message was sent, no Agent ran, and nothing was saved.',
    );
  }, []);

  const headerEnd = useMemo(
    () => (
      <HStack gap={2} vAlign="center">
        <Badge label="Sample" variant="neutral" />
        <Button label="New chat" size="sm" variant="secondary" onClick={startNewChat} />
      </HStack>
    ),
    [startNewChat],
  );

  const header = useMemo(
    () => (
      <DrawerHeader
        title="Agent"
        subtitle="Conversation sample, not saved"
        onOpenChange={onOpenChange}
        hasDivider
        endContent={headerEnd}
      />
    ),
    [onOpenChange, headerEnd],
  );

  const contextContent = useMemo(
    () => (
      <VStack gap={2}>
        <Text type="supporting" color="secondary">
          Suggested context: {pageLabel} page, sample Project Checkout API. Add it only if you
          choose Inject context.
        </Text>
        {isContextInjected ? (
          <Token
            label={`Current page: ${pageLabel} (sample)`}
            onRemove={removeContext}
            description="Local sample context only. Nothing was sent."
          />
        ) : (
          <Button label="Inject context" size="sm" variant="secondary" onClick={injectContext} />
        )}
      </VStack>
    ),
    [pageLabel, isContextInjected, removeContext, injectContext],
  );

  const contextDrawer = useMemo(
    () => (
      <ChatComposerDrawer
        label="Page context"
        count={isContextInjected ? 1 : 0}
        defaultIsCollapsed={false}
      >
        {contextContent}
      </ChatComposerDrawer>
    ),
    [isContextInjected, contextContent],
  );

  const composerInput = useMemo(
    () => <ChatComposerInput label="Sample agent message" hasHistory={false} />,
    [],
  );

  const composer = useMemo(
    () => (
      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSubmit={handleSubmit}
        input={composerInput}
        placeholder="Type a sample message..."
        drawer={contextDrawer}
        status={COMPOSER_STATUS}
      />
    ),
    [draft, handleSubmit, composerInput, contextDrawer],
  );

  const transcript = useMemo(
    () => (
      <ChatMessageList density="compact" gap={2} align="top">
        <ChatSystemMessage variant="divider">Sample conversation</ChatSystemMessage>
        {messages.map((message) => (
          <TranscriptRow key={message.id} message={message} />
        ))}
        {notice === null ? null : <ChatSystemMessage>{notice}</ChatSystemMessage>}
        <ChatSystemMessage>{SAMPLE_NOTICE_TEXT}</ChatSystemMessage>
      </ChatMessageList>
    ),
    [messages, notice],
  );

  const emptyState = useMemo(
    () => (
      <EmptyState
        title="New sample chat"
        description="No messages are present. This view is not saved."
        isCompact
      />
    ),
    [],
  );

  const body = useMemo(
    () => (
      <ChatLayout density="compact" composer={composer} emptyState={emptyState}>
        {transcript}
      </ChatLayout>
    ),
    [composer, emptyState, transcript],
  );

  const content = useMemo(() => <LayoutContent padding={0}>{body}</LayoutContent>, [body]);

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      side="end"
      width={420}
      label="Agent conversation sample"
      padding={0}
    >
      <Layout height="fill" header={header} content={content} />
    </Drawer>
  );
}
