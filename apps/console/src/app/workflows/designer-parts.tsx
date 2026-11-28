import { useCallback } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { ListItem } from '@astryxdesign/core/List';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';

import { plannedWorkflows } from '../../fixtures/workflows';
import { stepKindLabel } from './workflow-parts';

type Step = (typeof plannedWorkflows)[number]['payload']['steps'][number];

export function StepRow({
  step,
  isSelected,
  onSelect,
}: {
  step: Step;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const handleClick = useCallback(() => onSelect(step.id), [onSelect, step.id]);
  return (
    <ListItem
      label={step.title}
      description={`${stepKindLabel(step.kind)}, ${step.summary}`}
      onClick={handleClick}
      isSelected={isSelected}
    />
  );
}

export function StepInspector({
  step,
  selectedIndex,
  stepCount,
  sectionLevel,
  onMoveEarlier,
  onMoveLater,
}: {
  step: Step | undefined;
  selectedIndex: number;
  stepCount: number;
  sectionLevel: 2 | 3;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
}) {
  return (
    <VStack gap={4}>
      <Heading level={4} accessibilityLevel={sectionLevel}>
        Selected step
      </Heading>
      {step === undefined ? (
        <Text color="secondary">Select a step to inspect it.</Text>
      ) : (
        <VStack gap={3}>
          <VStack gap={1}>
            <Text weight="semibold">{step.title}</Text>
            <Text type="supporting" color="secondary">
              {stepKindLabel(step.kind)}
            </Text>
            <Text>{step.summary}</Text>
          </VStack>
          <HStack gap={2}>
            <Button
              label="Move earlier"
              size="sm"
              isDisabled={selectedIndex <= 0}
              onClick={onMoveEarlier}
            />
            <Button
              label="Move later"
              size="sm"
              isDisabled={selectedIndex === stepCount - 1}
              onClick={onMoveLater}
            />
          </HStack>
          <Text type="supporting" color="secondary">
            Order changes stay in this local preview. Nothing is saved.
          </Text>
        </VStack>
      )}
    </VStack>
  );
}
