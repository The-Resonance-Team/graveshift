'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
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
import { List } from '@astryxdesign/core/List';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';

import { plannedWorkflows } from '../../fixtures/workflows';
import {
  WorkflowSafeguards,
  WorkflowStatus,
  WorkflowSteps,
  WorkflowValidation,
  workflowStatusLabel,
} from './workflow-parts';
import { WorkflowRow } from './workflow-rows';

type Workflow = (typeof plannedWorkflows)[number]['payload'];

const METADATA_LABEL = { position: 'start', width: 96 } as const;

function renderInspector(workflow: Workflow, sectionLevel: 2 | 3) {
  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Heading level={4} accessibilityLevel={sectionLevel}>
            {workflow.name}
          </Heading>
          <WorkflowStatus status={workflow.status} />
        </HStack>
        <Text color="secondary">{workflow.description}</Text>
      </VStack>
      <MetadataList label={METADATA_LABEL}>
        <MetadataListItem label="Version">{`Version ${workflow.version}`}</MetadataListItem>
        <MetadataListItem label="Status">{workflowStatusLabel(workflow.status)}</MetadataListItem>
        <MetadataListItem label="Steps">{`${workflow.steps.length} sample steps`}</MetadataListItem>
      </MetadataList>
      <WorkflowSteps steps={workflow.steps} />
      <WorkflowValidation validation={workflow.validation} />
      <Button label="Open designer" href={`/workflows/${workflow.id}`} as={Link} size="sm" />
    </VStack>
  );
}

export default function WorkflowsPage() {
  const [selectedId, setSelectedId] = useState<string>(() => plannedWorkflows[0]?.payload.id ?? '');
  const isNarrow = useMediaQuery('(max-width: 1024px)', true);
  const selectWorkflow = useCallback((id: string) => setSelectedId(id), []);
  const selected = plannedWorkflows.find(({ payload }) => payload.id === selectedId);

  const renderHeader = () => (
    <LayoutHeader hasDivider padding={4}>
      <VStack gap={3}>
        <Text type="label" color="secondary">
          GENERAL · WORKFLOWS
        </Text>
        <HStack gap={4} vAlign="start">
          <StackItem size="fill">
            <VStack gap={0}>
              <Heading level={1}>Workflows</Heading>
              <Text color="secondary">
                Inspect planned Project workflows and their sample steps.
              </Text>
            </VStack>
          </StackItem>
          {!isNarrow ? (
            <HStack gap={2}>
              <Button
                label="Open designer"
                href={selected === undefined ? '/workflows' : `/workflows/${selected.payload.id}`}
                as={Link}
                size="sm"
                isDisabled={selected === undefined}
              />
            </HStack>
          ) : null}
        </HStack>
        {isNarrow ? (
          <HStack gap={2}>
            <StackItem size="fill">
              <VStack hAlign="stretch">
                <Button
                  label="Designer"
                  href={selected === undefined ? '/workflows' : `/workflows/${selected.payload.id}`}
                  as={Link}
                  isDisabled={selected === undefined}
                />
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
          title="Planned feature · sample data"
          description="Workflow editing, execution and publishing are not connected to any system."
        />
        <Section padding={4}>
          <VStack gap={4}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Heading level={2}>Planned workflows</Heading>
              <Text type="supporting" color="secondary">
                {plannedWorkflows.length} sample workflows
              </Text>
            </HStack>
            <List density="balanced" hasDividers>
              {plannedWorkflows.map(({ payload }) => (
                <WorkflowRow
                  key={payload.id}
                  workflow={payload}
                  isSelected={payload.id === selectedId}
                  onSelect={selectWorkflow}
                />
              ))}
            </List>
          </VStack>
        </Section>
        <Section padding={4}>
          <WorkflowSafeguards headingLevel={2} />
        </Section>
        {isNarrow && selected !== undefined ? (
          <Section padding={4}>
            <VStack gap={4}>
              <Heading level={2}>Workflow details</Heading>
              {renderInspector(selected.payload, 3)}
            </VStack>
          </Section>
        ) : null}
      </VStack>
    </LayoutContent>
  );

  const renderEnd = () =>
    !isNarrow && selected !== undefined ? (
      <LayoutPanel width={360} padding={4} role="complementary" label="Workflow details">
        {renderInspector(selected.payload, 2)}
      </LayoutPanel>
    ) : undefined;

  return (
    <Layout
      height="fill"
      defaultHasDividers
      header={renderHeader()}
      content={renderContent()}
      end={renderEnd()}
    />
  );
}
