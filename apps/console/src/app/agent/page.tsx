'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import { useChat } from '@ai-sdk/react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { ChatLayout } from '@astryxdesign/core/Chat';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { HStack, Layout, LayoutContent, StackItem, VStack } from '@astryxdesign/core/Layout';
import { ResizeHandle, useResizable } from '@astryxdesign/core/Resizable';
import { Text } from '@astryxdesign/core/Text';
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden';

import { SAMPLE_TIMESTAMPS } from '../../fixtures/sample';
import { AgentComposer } from './agent-composer';
import { AgentConversation } from './agent-conversation';
import { AgentContextPanel } from './agent-context-panel';
import { fixtureMessages, sampleArtifact, sampleNotice } from './agent-fixtures';
import { localFixtureTransport } from './agent-transport';

type SampleMessage = (typeof fixtureMessages)[number];

const CHAT_LAYOUT_STYLE: CSSProperties = { flex: 1, minHeight: 0 };

export default function AgentPage() {
  const { messages, sendMessage, setMessages } = useChat<SampleMessage>({
    messages: fixtureMessages,
    transport: localFixtureTransport,
  });
  const [isContextInjected, setIsContextInjected] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isArtifactDialogOpen, setIsArtifactDialogOpen] = useState(false);
  const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
  const isNarrow = useMediaQuery('(max-width: 1023px)', true);
  const artifactResize = useResizable({ defaultSize: 480, minSize: 360, maxSize: 720 });

  const handleSubmit = useCallback(
    (value: string) => {
      const body = value.trim();
      if (body === '') return;
      void sendMessage({
        text: body,
        metadata: { origin: 'local', createdAt: SAMPLE_TIMESTAMPS.anchor },
      });
    },
    [sendMessage],
  );
  const handleNewChat = useCallback(() => setMessages([]), [setMessages]);
  const toggleContext = useCallback(() => setIsContextInjected((value) => !value), []);
  const togglePanel = useCallback(() => {
    if (isNarrow) {
      setIsArtifactDialogOpen(true);
      return;
    }
    setIsPanelOpen((value) => !value);
  }, [isNarrow]);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const closeArtifactDialog = useCallback(() => setIsArtifactDialogOpen(false), []);
  const openApproval = useCallback(() => setIsApprovalDialogOpen(true), []);
  const closeApproval = useCallback(() => setIsApprovalDialogOpen(false), []);
  const goToSource = useCallback(() => {
    document.getElementById(`message-${sampleArtifact.sourceMessageId}`)?.scrollIntoView({
      block: 'center',
    });
  }, []);

  const renderComposer = () => (
    <AgentComposer
      onSubmit={handleSubmit}
      onNewChat={handleNewChat}
      onTogglePanel={togglePanel}
      onToggleContext={toggleContext}
      isContextInjected={isContextInjected}
      isPanelOpen={!isNarrow && isPanelOpen}
    />
  );

  const renderEmptyState = () => (
    <Text color="secondary">Local sample chat cleared. No Agent is connected.</Text>
  );

  const renderDesktopPanel = () => (
    <>
      <ResizeHandle
        direction="horizontal"
        resizable={artifactResize.props}
        isReversed
        hasDivider
        label="Resize artifact panel"
      />
      <Card variant="transparent" height="100%" width={artifactResize.size}>
        <AgentContextPanel
          artifact={sampleArtifact}
          onSourceMessage={goToSource}
          onClose={closePanel}
          showClose
        />
      </Card>
    </>
  );

  return (
    <>
      <Layout height="fill">
        <LayoutContent role="main" padding={0}>
          <VisuallyHidden as="h1">Agent Workspace</VisuallyHidden>
          <VStack gap={0} height="100%">
            <Banner
              status="info"
              container="section"
              title="Planned Agent Workspace · sample data"
              description={sampleNotice}
            />
            <StackItem size="fill">
              <HStack gap={0} height="100%">
                <StackItem size="fill">
                  <ChatLayout
                    density="spacious"
                    style={CHAT_LAYOUT_STYLE}
                    composer={renderComposer()}
                    emptyState={renderEmptyState()}
                  >
                    <AgentConversation messages={messages} onApprovalPreview={openApproval} />
                  </ChatLayout>
                </StackItem>
                {!isNarrow && isPanelOpen ? renderDesktopPanel() : null}
              </HStack>
            </StackItem>
          </VStack>
        </LayoutContent>
      </Layout>
      <Dialog
        isOpen={isNarrow && isArtifactDialogOpen}
        onOpenChange={closeArtifactDialog}
        purpose="info"
        variant="fullscreen"
      >
        <DialogHeader
          title="Artifact context"
          subtitle="Sample artifact, linked to conversation"
          onOpenChange={closeArtifactDialog}
        />
        <AgentContextPanel
          artifact={sampleArtifact}
          onSourceMessage={goToSource}
          onClose={closeArtifactDialog}
          showClose={false}
        />
      </Dialog>
      <Dialog isOpen={isApprovalDialogOpen} onOpenChange={closeApproval} purpose="info">
        <DialogHeader
          title="Task approval preview"
          subtitle="No approval exists in this sample."
          onOpenChange={closeApproval}
        />
        <VStack gap={3}>
          <Text>
            A future flow would ask one person to approve this sample change before any mutation. No
            request was sent and no decision is recorded here.
          </Text>
          <Button label="Close preview" onClick={closeApproval} />
        </VStack>
      </Dialog>
    </>
  );
}
