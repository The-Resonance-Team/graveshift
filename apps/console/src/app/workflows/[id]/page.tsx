'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import {
  HStack,
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
  Section,
  StackItem,
  VStack,
} from '@astryxdesign/core/Layout';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { List } from '@astryxdesign/core/List';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';

import { plannedWorkflowDesigner, plannedWorkflows } from '../../../fixtures/workflows';
import { StepInspector, StepRow } from '../designer-parts';
import {
  WorkflowSafeguards,
  WorkflowStatus,
  WorkflowSteps,
  WorkflowValidation,
  workflowStatusLabel,
} from '../workflow-parts';

const METADATA_LABEL = { position: 'start', width: 96 } as const;

export default function WorkflowDesignerPage() {
  const params = useParams<{ id: string }>();
  const fixture = plannedWorkflows.find((item) => item.payload.id === params.id);
  const payload = fixture?.payload;
  const isNarrow = useMediaQuery('(max-width: 1024px)', true);

  const stepsById = useMemo(
    () => new Map((payload?.steps ?? []).map((step) => [step.id, step])),
    [payload],
  );
  const [stepOrder, setStepOrder] = useState<string[]>(() =>
    (payload?.steps ?? []).map((step) => step.id),
  );
  const [selectedStepId, setSelectedStepId] = useState(() =>
    payload?.id === plannedWorkflowDesigner.payload.workflowId
      ? plannedWorkflowDesigner.payload.selectedStepId
      : (payload?.steps[0]?.id ?? ''),
  );
  const publishDialogRef = useRef<HTMLDialogElement>(null);

  const selectStep = useCallback((id: string) => setSelectedStepId(id), []);
  const moveSelectedStep = useCallback(
    (offset: -1 | 1) => {
      setStepOrder((current) => {
        const index = current.indexOf(selectedStepId);
        const target = index + offset;
        if (index < 0 || target < 0 || target >= current.length) return current;
        const from = current[index];
        const to = current[target];
        if (from === undefined || to === undefined) return current;
        const next = [...current];
        next[index] = to;
        next[target] = from;
        return next;
      });
    },
    [selectedStepId],
  );
  const moveEarlier = useCallback(() => moveSelectedStep(-1), [moveSelectedStep]);
  const moveLater = useCallback(() => moveSelectedStep(1), [moveSelectedStep]);
  const showPublishPreview = useCallback(() => publishDialogRef.current?.showModal(), []);
  const closePublishPreview = useCallback(() => publishDialogRef.current?.close(), []);

  const orderedSteps = stepOrder.flatMap((id) => {
    const step = stepsById.get(id);
    return step === undefined ? [] : [step];
  });
  const selectedStep = orderedSteps.find((step) => step.id === selectedStepId);
  const selectedIndex = orderedSteps.findIndex((step) => step.id === selectedStepId);

  if (fixture === undefined || payload === undefined) {
    return (
      <Layout height="fill">
        <LayoutContent role="main" padding={4}>
          <VStack gap={4}>
            <EmptyState
              headingLevel={1}
              title="Planned workflow not found"
              description="This preview contains only the sample workflows listed on the Workflows page."
            />
            <Button label="Back to workflows" href="/workflows" as={Link} />
          </VStack>
        </LayoutContent>
      </Layout>
    );
  }

  const renderHeader = () => (
    <LayoutHeader hasDivider padding={4}>
      <VStack gap={3}>
        <Button label="Back to workflows" href="/workflows" as={Link} size="sm" />
        <HStack gap={4} vAlign="start">
          <StackItem size="fill">
            <VStack gap={0}>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Heading level={1}>{payload.name}</Heading>
                <WorkflowStatus status={payload.status} />
              </HStack>
              <Text color="secondary">{payload.description}</Text>
              <HStack gap={1} vAlign="center" wrap="wrap">
                <Text type="supporting" color="secondary">
                  {`Version ${payload.version}`}
                </Text>
                <Text type="supporting" color="secondary">
                  Sample Project workflow
                </Text>
              </HStack>
            </VStack>
          </StackItem>
          {!isNarrow ? (
            <HStack gap={2}>
              <Button label="Preview publish confirmation" onClick={showPublishPreview} />
            </HStack>
          ) : null}
        </HStack>
        {isNarrow ? (
          <HStack gap={2}>
            <StackItem size="fill">
              <VStack hAlign="stretch">
                <Button label="Preview publish confirmation" onClick={showPublishPreview} />
              </VStack>
            </StackItem>
          </HStack>
        ) : null}
      </VStack>
    </LayoutHeader>
  );

  const renderContent = () => (
    <LayoutContent role="main" padding={4}>
      <VStack gap={4}>
        <Banner
          status="info"
          title="Planned designer · sample data"
          description="Editing, validation and publishing are previews. No API call or real change happens here."
        />
        <Section padding={4}>
          <VStack gap={4}>
            <Heading level={2}>Editable steps (preview)</Heading>
            <Text color="secondary">
              Select a step to inspect it. Moving a step changes this preview only.
            </Text>
            <List density="compact" hasDividers>
              {orderedSteps.map((step) => (
                <StepRow
                  key={step.id}
                  step={step}
                  isSelected={step.id === selectedStepId}
                  onSelect={selectStep}
                />
              ))}
            </List>
          </VStack>
        </Section>
        <Section padding={4}>
          <VStack gap={4}>
            <Heading level={2}>Steps in sequence</Heading>
            <WorkflowSteps steps={orderedSteps} />
            <Text type="supporting" color="secondary">
              Sample steps do not carry input, output or failure contracts.
            </Text>
          </VStack>
        </Section>
        <Section padding={4}>
          <VStack gap={4}>
            <Heading level={2}>Version</Heading>
            <MetadataList label={METADATA_LABEL}>
              <MetadataListItem label="Version">{`Version ${payload.version}`}</MetadataListItem>
              <MetadataListItem label="Status">
                {workflowStatusLabel(payload.status)}
              </MetadataListItem>
              <MetadataListItem label="Steps">{`${orderedSteps.length} sample steps`}</MetadataListItem>
            </MetadataList>
            <Text color="secondary">
              Sample version only. Existing runs keep their version. New runs would use the
              published version in a future implementation.
            </Text>
          </VStack>
        </Section>
        <Section padding={4}>
          <WorkflowValidation validation={payload.validation} />
        </Section>
        <Section padding={4}>
          <WorkflowSafeguards headingLevel={2} />
        </Section>
        {isNarrow ? (
          <Section padding={4}>
            <StepInspector
              step={selectedStep}
              selectedIndex={selectedIndex}
              stepCount={orderedSteps.length}
              sectionLevel={3}
              onMoveEarlier={moveEarlier}
              onMoveLater={moveLater}
            />
          </Section>
        ) : null}
        <dialog ref={publishDialogRef} aria-labelledby="publish-preview-title">
          <VStack gap={3}>
            <Heading level={2} id="publish-preview-title">
              Publish confirmation preview
            </Heading>
            <Text>
              Nothing was published. A future owner flow would confirm validation before a new
              workflow version takes effect.
            </Text>
            <Button label="Close preview" onClick={closePublishPreview} />
          </VStack>
        </dialog>
      </VStack>
    </LayoutContent>
  );

  const renderEnd = () =>
    !isNarrow ? (
      <LayoutPanel width={320} padding={4} role="complementary" label="Selected step">
        <StepInspector
          step={selectedStep}
          selectedIndex={selectedIndex}
          stepCount={orderedSteps.length}
          sectionLevel={2}
          onMoveEarlier={moveEarlier}
          onMoveLater={moveLater}
        />
      </LayoutPanel>
    ) : undefined;

  return (
    <Layout
      height="fill"
      contentWidth={1000}
      defaultHasDividers
      header={renderHeader()}
      content={renderContent()}
      end={renderEnd()}
    />
  );
}
