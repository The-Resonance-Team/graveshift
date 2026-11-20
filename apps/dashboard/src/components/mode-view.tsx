'use client';

import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';

import { MODE_COPY } from '../lib/terms';
import { useMode } from '../lib/use-mode';

export function ModeView() {
  const { data, isError } = useMode();
  return (
    <Card>
      <VStack gap={2}>
        <Heading level={2}>Mode</Heading>
        {isError ? (
          <Text type="supporting">Unknown: the daemon did not answer.</Text>
        ) : !data ? (
          <Text type="supporting" role="status">
            Loading…
          </Text>
        ) : (
          <>
            <Token label={data.effective} color="green" />
            <Text type="supporting">{MODE_COPY[data.effective]}</Text>
            {data.policy !== data.effective ? (
              <Text type="supporting">
                policy.yaml says {data.policy}; the environment lowered it.
              </Text>
            ) : null}
            {data.warning ? (
              <Token label={`Ignored override: ${data.warning}`} color="orange" />
            ) : null}
          </>
        )}
      </VStack>
    </Card>
  );
}
