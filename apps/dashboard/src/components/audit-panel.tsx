'use client';

import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';

import { useAudit, useChain } from '../lib/use-audit';
import { Term } from './term';

function ChainBadge() {
  const { data, isError } = useChain();
  if (isError) return <Token label="Chain not checked" color="orange" />;
  if (!data) return <Text type="supporting">Checking…</Text>;
  return data.ok ? (
    <Token label={`Chain verified: ${data.length} entries`} color="green" />
  ) : (
    <Token label={`Chain broken at ${data.brokenAtSeq}: ${data.reason}`} color="red" />
  );
}

export function AuditPanel() {
  const { data } = useAudit();
  const recent = (data ?? []).toReversed().slice(0, 8);
  return (
    <Card>
      <VStack gap={2}>
        <HStack gap={2} hAlign="between" wrap="wrap">
          <Heading level={2}>
            <Term name="auditLog" />
          </Heading>
          <ChainBadge />
        </HStack>
        {recent.length === 0 ? (
          <Text type="supporting">No decisions recorded yet.</Text>
        ) : (
          <List hasDividers density="compact">
            {recent.map((entry) => (
              <ListItem
                key={entry.seq}
                itemKey={entry.seq}
                label={
                  <HStack gap={2} wrap="wrap">
                    <Text type="supporting">#{entry.seq}</Text>
                    <Text type="label">{entry.type}</Text>
                  </HStack>
                }
                endContent={
                  <Timestamp
                    value={entry.at}
                    format="time"
                    timezoneID="Asia/Ho_Chi_Minh"
                    type="supporting"
                  />
                }
              />
            ))}
          </List>
        )}
      </VStack>
    </Card>
  );
}
