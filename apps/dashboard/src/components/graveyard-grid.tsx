'use client';

import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useCallback } from 'react';

import { useGraveyard } from '../lib/use-graveyard';
import { GraveCard } from './grave-card';

export function GraveyardGrid() {
  const { data, isPending, isError, error, refetch } = useGraveyard();
  const retry = useCallback(() => void refetch(), [refetch]);
  return (
    <section aria-labelledby="graves-title">
      <VStack gap={3}>
        <Heading level={2} id="graves-title">
          Watched services
        </Heading>
        {isPending ? (
          <Text type="supporting" role="status">
            Loading watched services…
          </Text>
        ) : isError ? (
          <Card>
            <VStack gap={3}>
              <Text>Could not reach the Graveshift daemon ({error.message}).</Text>
              <HStack>
                <Button label="Try again" variant="secondary" onClick={retry} />
              </HStack>
            </VStack>
          </Card>
        ) : data.length === 0 ? (
          <EmptyState
            headingLevel={2}
            title="No services are watched yet"
            description="Start the demo app or set WATCH_SERVICES on the daemon."
          />
        ) : (
          <Grid columns={{ minWidth: 240, repeat: 'fit', max: 4 }} gap={3}>
            {data.map((grave) => (
              <GraveCard key={grave.name} grave={grave} />
            ))}
          </Grid>
        )}
      </VStack>
    </section>
  );
}
