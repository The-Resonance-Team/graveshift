'use client';

import { EmptyState } from '@astryxdesign/core/EmptyState';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { List, ListItem } from '@astryxdesign/core/List';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';

import { isOpen } from '../lib/data/incident-model';
import { useIncidents } from '../lib/use-incidents';
import { Term } from './term';

const SEVERITY = {
  info: 'neutral',
  warning: 'warning',
  critical: 'error',
} as const;

export function IncidentList() {
  const { data } = useIncidents();
  const [view, setView] = useState('open');
  const all = data ?? [];
  const shown = view === 'open' ? all.filter(isOpen) : all;
  return (
    <section aria-labelledby="incidents-title">
      <VStack gap={3}>
        <HStack gap={3} hAlign="between" wrap="wrap">
          <Heading level={2} id="incidents-title">
            Open <Term name="incident" />s <Text type="supporting">({shown.length})</Text>
          </Heading>
          <SegmentedControl label="Incident view" value={view} onChange={setView} size="sm">
            <SegmentedControlItem value="open" label="Open" />
            <SegmentedControlItem value="all" label="All" />
          </SegmentedControl>
        </HStack>
        {shown.length === 0 ? (
          <EmptyState
            headingLevel={3}
            title="Nothing is haunted right now"
            description="Inject a fault with the Haunt panel to see an incident."
          />
        ) : (
          <List hasDividers density="compact">
            {shown.map((item) => (
              <ListItem
                key={item.incident.id}
                itemKey={item.incident.id}
                href={`/incidents/${encodeURIComponent(item.incident.id)}`}
                label={
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <StatusDot variant={SEVERITY[item.severity]} label={item.severity} />
                    <Text type="label" weight="semibold">
                      {item.incident.service}
                    </Text>
                    <Token label={item.incident.state.replace('_', ' ')} />
                    {item.pr ? <Token label={`Draft PR #${item.pr.number}`} color="green" /> : null}
                  </HStack>
                }
                description={
                  <HStack gap={2} hAlign="between" wrap="wrap">
                    <Text type="supporting">{item.category ?? 'Awaiting diagnosis'}</Text>
                    <Timestamp
                      value={item.incident.updatedAt}
                      format="date_time"
                      timezoneID="Asia/Ho_Chi_Minh"
                      type="supporting"
                    />
                  </HStack>
                }
              />
            ))}
          </List>
        )}
      </VStack>
    </section>
  );
}
