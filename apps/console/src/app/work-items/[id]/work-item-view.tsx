'use client';

import { useMemo } from 'react';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { HStack } from '@astryxdesign/core/HStack';
import { Layout, LayoutContent, LayoutHeader, LayoutPanel } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { Heading, Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

import { sampleWorkItems } from '../../../fixtures/work-items';

import { assignmentLabel } from '../work-assignment';
import {
  commandsForItem,
  fixResultsForItem,
  priorityLabel,
  routingForItem,
  statusLabel,
  triageResultsForItem,
} from '../work-view';

import { DetailRail, MainSections } from './sections';

export function WorkItemView({ id }: { id: string }) {
  const isNarrow = useMediaQuery('(max-width: 1024px)', true);
  const sample = sampleWorkItems.find((entry) => entry.payload.id === id);
  if (sample === undefined) return null;

  const item = sample.payload;
  const routing = routingForItem(id)?.payload.routing;
  const fixResults = fixResultsForItem(id);
  const autoFixes = triageResultsForItem(id).flatMap(({ payload }) =>
    payload.autoFix === null ? [] : [payload.autoFix],
  );
  const commands = commandsForItem(id);
  const rail = useMemo(() => <DetailRail item={item} />, [item]);

  const header = useMemo(
    () => (
      <LayoutHeader padding={6} hasDivider>
        <VStack gap={4}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Link href="/work-items" type="supporting" color="secondary">
              Work items
            </Link>
            <Divider orientation="vertical" />
            <Text type="supporting" color="secondary">
              {item.id}
            </Text>
            <Divider orientation="vertical" />
            <Text type="supporting" color="secondary">
              {item.service}
            </Text>
          </HStack>
          <HStack gap={4} vAlign="start" hAlign="between" wrap="wrap">
            <VStack gap={2}>
              <Heading level={1} maxLines={2}>
                {item.title}
              </Heading>
              <HStack gap={1} wrap="wrap">
                <Badge label={statusLabel(item.status)} variant="neutral" />
                <Badge label={`${priorityLabel(item.priority)} priority`} variant="neutral" />
                <Badge label={assignmentLabel(item.assignee)} variant="neutral" />
              </HStack>
            </VStack>
            <Text type="supporting" color="secondary">
              Sample work item. No command is sent from this page.
            </Text>
          </HStack>
        </VStack>
      </LayoutHeader>
    ),
    [item],
  );

  const content = useMemo(
    () => (
      <LayoutContent padding={6} role="main">
        <VStack gap={6}>
          <Banner
            status="info"
            title="Sample work item"
            description={`${sample.notice} No API request is made and no command is sent from this page.`}
          />
          <MainSections
            item={item}
            routing={routing}
            fixResults={fixResults}
            autoFixes={autoFixes}
            commands={commands}
          />
          {isNarrow ? (
            <>
              <Divider />
              <Heading level={2}>Task details</Heading>
              {rail}
            </>
          ) : null}
        </VStack>
      </LayoutContent>
    ),
    [autoFixes, commands, fixResults, isNarrow, item, rail, routing, sample.notice],
  );

  const end = useMemo(
    () =>
      !isNarrow ? (
        <LayoutPanel width={340} padding={6} role="complementary" hasDivider>
          {rail}
        </LayoutPanel>
      ) : undefined,
    [isNarrow, rail],
  );

  return <Layout height="fill" contentWidth={1260} header={header} content={content} end={end} />;
}
