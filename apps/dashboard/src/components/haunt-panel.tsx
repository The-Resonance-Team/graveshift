'use client';

import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { type FormEvent, useCallback, useState } from 'react';

import { SCENARIOS } from '../lib/terms';
import { DEMO_COOLDOWN_SECONDS, useHaunt } from '../lib/use-haunt';

export function HauntPanel() {
  const [scenario, setScenario] = useState<string>(SCENARIOS[0].id);
  const haunt = useHaunt();
  const result = haunt.data;
  const busy = haunt.isPending || haunt.remaining > 0;
  const { mutate } = haunt;
  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      mutate(scenario);
    },
    [mutate, scenario],
  );
  return (
    <Card>
      <VStack gap={3}>
        <Heading level={2}>Haunt the demo app</Heading>
        <Text type="supporting">
          Demo only: injects a fault into the Haunted Candy Shop, never into your services. One
          haunt per {DEMO_COOLDOWN_SECONDS} s.
        </Text>
        <form onSubmit={submit}>
          <VStack gap={3}>
            <RadioList label="Fault scenario" value={scenario} onChange={setScenario} size="sm">
              {SCENARIOS.map((s) => (
                <RadioListItem
                  key={s.id}
                  value={s.id}
                  label={s.id}
                  description={s.plain}
                  align="first-line"
                />
              ))}
            </RadioList>
            <Button
              label={
                haunt.isPending
                  ? 'Haunting…'
                  : haunt.remaining > 0
                    ? `Wait ${haunt.remaining} s`
                    : 'Haunt'
              }
              type="submit"
              variant="primary"
              isDisabled={busy}
              width="100%"
            />
          </VStack>
        </form>
        <Text type="supporting" role="status" aria-live="polite">
          {result?.ok
            ? `Injected ${result.scenario}. Watch the graveyard.`
            : result
              ? result.status === 429
                ? 'Rate limited by the daemon.'
                : result.status === 404
                  ? 'Haunting is off: HAUNT_TOKEN is not set on the daemon.'
                  : `Failed: ${result.message}`
              : haunt.isError
                ? haunt.error.message
                : ''}
        </Text>
      </VStack>
    </Card>
  );
}
