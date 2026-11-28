'use client';

import type { ReactNode } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { List, ListItem } from '@astryxdesign/core/List';
import { Section } from '@astryxdesign/core/Section';
import { Heading, Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import type { WorkItem } from '@graveshift/core';
import type { TriageResult, WorkRouting } from '@graveshift/work';

import {
  sampleFixResults,
  sampleWorkCommands,
  sampleWorkErrors,
} from '../../../fixtures/work-results';

import { assignmentLabel } from '../work-assignment';
import {
  effectLabel,
  failureLabel,
  priorityLabel,
  routingStateLabel,
  severityLabel,
  statusLabel,
  triggerLabel,
} from '../work-view';

type FixFixture = (typeof sampleFixResults)[number];
type CommandFixture = (typeof sampleWorkCommands)[number];
type AutoFix = NonNullable<TriageResult['autoFix']>;

interface MainSectionsProps {
  item: WorkItem;
  routing: WorkRouting['routing'] | undefined;
  fixResults: readonly FixFixture[];
  autoFixes: readonly AutoFix[];
  commands: readonly CommandFixture[];
}

function SectionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Section padding={6}>
      <VStack gap={4}>
        <Heading level={2}>{title}</Heading>
        {children}
      </VStack>
    </Section>
  );
}

export function MainSections({
  item,
  routing,
  fixResults,
  autoFixes,
  commands,
}: MainSectionsProps) {
  const question = routing?.question;
  return (
    <>
      <SectionBlock title="Description">
        <Text>{item.description}</Text>
      </SectionBlock>
      <Divider />
      <SectionBlock title="Success criteria">
        <List hasDividers>
          {item.successCriteria.map((criterion) => (
            <ListItem key={criterion} label={criterion} />
          ))}
        </List>
      </SectionBlock>
      <Divider />
      <Section padding={6}>
        <VStack gap={4}>
          <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
            <Heading level={2}>Subtasks</Heading>
            <Text type="supporting" color="secondary">
              {item.subtasks.completed} of {item.subtasks.items.length} complete in this sample
            </Text>
          </HStack>
          <List hasDividers>
            {item.subtasks.items.map((task) => (
              <ListItem
                key={task.id}
                label={task.title}
                description={task.done ? 'Complete' : 'Open'}
              />
            ))}
          </List>
        </VStack>
      </Section>
      <Divider />
      <SectionBlock title="Diagnosis and evidence">
        <Text color="secondary">
          Detailed diagnosis and evidence are not included in the sample work-item response. None is
          shown here.
        </Text>
        <MetadataList>
          <MetadataListItem label="Diagnosis reference">
            <Text type="code">{item.diagnosisRef}</Text>
          </MetadataListItem>
        </MetadataList>
      </SectionBlock>
      <Divider />
      <SectionBlock title="Routing">
        {routing === null || routing === undefined ? (
          <Text color="secondary">No sample routing is provided for this state.</Text>
        ) : (
          <MetadataList>
            <MetadataListItem label="State">
              <Text>{routingStateLabel(routing.state)}</Text>
            </MetadataListItem>
            <MetadataListItem label="Agent">
              <Text>{routing.agent}</Text>
            </MetadataListItem>
            <MetadataListItem label="Trigger">
              <Text>{triggerLabel(routing.trigger)}</Text>
            </MetadataListItem>
            <MetadataListItem label="Attempt">
              <Text type="code">{routing.attemptId}</Text>
            </MetadataListItem>
          </MetadataList>
        )}
        {question !== null && question !== undefined ? (
          <VStack gap={2}>
            <Heading level={3}>Saved question</Heading>
            <Text>{question}</Text>
            <MetadataList>
              <MetadataListItem label="Question reference">
                <Text type="code">{routing?.questionId ?? 'Not provided'}</Text>
              </MetadataListItem>
              <MetadataListItem label="Required input">
                <Text type="code">{routing?.missing.join(', ')}</Text>
              </MetadataListItem>
            </MetadataList>
          </VStack>
        ) : null}
      </SectionBlock>
      {fixResults.length > 0 ? (
        <>
          <Divider />
          <SectionBlock title="Fix outcome samples">
            <Text color="secondary">
              Recorded fixture outcomes for this work item. This page does not produce them.
            </Text>
            <List hasDividers>
              {fixResults.map(({ id: fixtureId, payload }) => (
                <ListItem
                  key={fixtureId}
                  label={failureLabel(payload.failure)}
                  description={[
                    payload.reason ?? 'No reason was provided in this sample.',
                    payload.pr === null
                      ? 'No draft pull request in this sample.'
                      : `Sample draft pull request, ${payload.pr.number}`,
                    `Attempt, ${payload.attemptId ?? 'Not provided'}`,
                    `Effect, ${effectLabel(payload.effect)}`,
                  ].join(', ')}
                />
              ))}
            </List>
          </SectionBlock>
        </>
      ) : null}
      {autoFixes.length > 0 ? (
        <>
          <Divider />
          <SectionBlock title="Triage outcome samples">
            <List hasDividers>
              {autoFixes.map((autoFix) => (
                <ListItem
                  key={autoFix.attemptId ?? autoFix.failure}
                  label={failureLabel(autoFix.failure)}
                  description={[
                    autoFix.reason ?? 'No reason was provided in this sample.',
                    `Attempt, ${autoFix.attemptId ?? 'Not provided'}`,
                    `Effect, ${effectLabel(autoFix.effect)}`,
                  ].join(', ')}
                />
              ))}
            </List>
          </SectionBlock>
        </>
      ) : null}
      {commands.length > 0 ? (
        <>
          <Divider />
          <SectionBlock title="Sample command envelopes">
            <Text color="secondary">
              Read-only fixture examples. This page does not send these commands.
            </Text>
            <List hasDividers>
              {commands.map(({ id: fixtureId, payload }) => (
                <ListItem
                  key={fixtureId}
                  label={`Command, ${payload.caller.commandId}`}
                  description={`Work item, ${payload.id}${
                    'questionId' in payload.input ? `, question ${payload.input.questionId}` : ''
                  }`}
                />
              ))}
            </List>
          </SectionBlock>
        </>
      ) : null}
      <Divider />
      <SectionBlock title="Sample command errors">
        <Text color="secondary">
          Error fixtures for design review. This page does not produce these results.
        </Text>
        <List hasDividers>
          {sampleWorkErrors.map(({ id: fixtureId, payload }) => (
            <ListItem
              key={fixtureId}
              label={payload.message}
              description={`${payload.code}, status ${payload.status}`}
            />
          ))}
        </List>
      </SectionBlock>
    </>
  );
}

export function DetailRail({ item }: { item: WorkItem }) {
  return (
    <VStack gap={10}>
      <VStack gap={4}>
        <HStack gap={2} vAlign="center" hAlign="between" wrap="wrap">
          <Heading level={3}>Details</Heading>
          <Badge label="Sample" variant="neutral" />
        </HStack>
        <MetadataList>
          <MetadataListItem label="Status">
            <Text>{statusLabel(item.status)}</Text>
          </MetadataListItem>
          <MetadataListItem label="Priority">
            <Text>{priorityLabel(item.priority)}</Text>
          </MetadataListItem>
          <MetadataListItem label="Severity">
            <Text>{severityLabel(item.severity)}</Text>
          </MetadataListItem>
          <MetadataListItem label="Assignment">
            <Text>{assignmentLabel(item.assignee)}</Text>
          </MetadataListItem>
          <MetadataListItem label="Service">
            <Text>{item.service}</Text>
          </MetadataListItem>
          <MetadataListItem label="Fix queue">
            <Text>{item.fixPriority}</Text>
          </MetadataListItem>
          <MetadataListItem label="Reporter">
            <Text>{item.reporter}</Text>
          </MetadataListItem>
          <MetadataListItem label="Team">
            <Text>{item.team}</Text>
          </MetadataListItem>
          <MetadataListItem label="Sprint">
            <Text>{item.sprint ?? 'Not set'}</Text>
          </MetadataListItem>
          <MetadataListItem label="Due date">
            <Text>{item.dueDate ?? 'Not set'}</Text>
          </MetadataListItem>
        </MetadataList>
      </VStack>
      <VStack gap={4}>
        <Heading level={3}>Triage and fix</Heading>
        <Text color="secondary">
          Actions are not connected. No triage, fix, approval, or answer command is sent from this
          page.
        </Text>
        <Button label="Fix now" variant="secondary" isDisabled />
        <Button label="Assign to an Agent" variant="secondary" isDisabled />
        <Button label="Answer saved question" variant="secondary" isDisabled />
        <Text color="secondary">
          {item.draftPr === null
            ? 'No draft pull request in this sample.'
            : `Sample draft pull request, ${item.draftPr.number}`}
        </Text>
      </VStack>
    </VStack>
  );
}
