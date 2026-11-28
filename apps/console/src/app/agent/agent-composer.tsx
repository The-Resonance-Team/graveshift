import { Button } from '@astryxdesign/core/Button';
import { ChatComposer, ChatComposerInput } from '@astryxdesign/core/Chat';
import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';

const COMPOSER_STATUS = {
  type: 'warning',
  message: 'Local sample input. No Agent responds and nothing is saved.',
} as const;

export function AgentComposer({
  onSubmit,
  onNewChat,
  onTogglePanel,
  onToggleContext,
  isContextInjected,
  isPanelOpen,
}: {
  onSubmit: (value: string) => void;
  onNewChat: () => void;
  onTogglePanel: () => void;
  onToggleContext: () => void;
  isContextInjected: boolean;
  isPanelOpen: boolean;
}) {
  const renderInput = () => (
    <ChatComposerInput placeholder="Local sample input. No response is generated." />
  );

  const renderHeaderActions = () => (
    <HStack gap={2}>
      <Button label="New chat" size="sm" onClick={onNewChat} />
      <Button
        label={isPanelOpen ? 'Hide artifact' : 'Show artifact'}
        size="sm"
        onClick={onTogglePanel}
      />
    </HStack>
  );

  const renderFooterActions = () => (
    <HStack gap={2} wrap="wrap">
      <Button
        label={isContextInjected ? 'Remove context' : 'Inject context'}
        size="sm"
        onClick={onToggleContext}
      />
      {isContextInjected ? (
        <Text type="supporting" color="secondary">
          Sample work item context added to this preview only.
        </Text>
      ) : null}
      {isContextInjected ? <Token label="Sample work item" /> : null}
    </HStack>
  );

  return (
    <ChatComposer
      onSubmit={onSubmit}
      placeholder="Sample input only. Nothing is sent."
      input={renderInput()}
      headerActions={renderHeaderActions()}
      footerActions={renderFooterActions()}
      status={COMPOSER_STATUS}
    />
  );
}
