'use client';

import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Step, Stepper } from '@astryxdesign/core/Stepper';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useCallback, useState, useSyncExternalStore } from 'react';

import { type TermKey, TERMS } from '../lib/terms';
import { Term } from './term';

const STORAGE_KEY = 'graveshift.first-run.done';

const STEPS = [
  {
    title: 'Start the crew',
    label: 'Start',
    body: 'Run the daemon next to your services. The demo stack starts everything at once:',
    code: 'docker compose -f deploy/compose/graveshift.compose.yml -f deploy/compose/demo.compose.yml up -d --build',
  },
  {
    title: 'Check the policy',
    label: 'Policy',
    body: 'Graveshift reads policy.yaml. It starts in propose mode: draft pull requests only, every runtime action needs a blessing.',
    code: 'bun packages/policy/src/cli.ts policy check policy.yaml',
  },
  {
    title: 'Learn the words',
    label: 'Words',
    body: 'Every spooky label has a plain meaning. Hover or Tab onto it to read it.',
    code: null,
  },
] as const;

// localStorage as an external store: the server snapshot says "dismissed" so nothing flashes before hydration
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
};
const readDismissed = () => window.localStorage.getItem(STORAGE_KEY) === '1';
const markDismissed = () => {
  window.localStorage.setItem(STORAGE_KEY, '1');
  for (const listener of listeners) listener();
};

export function FirstRunWizard({ needed }: { needed: boolean }) {
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  const [step, setStep] = useState(0);
  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);
  const next = useCallback(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), []);
  if (!needed || dismissed) return null;
  const current = STEPS[step] ?? STEPS[0];
  return (
    <Card>
      <VStack gap={4}>
        <VStack gap={1}>
          <Text type="supporting">
            First run, step {step + 1} of {STEPS.length}
          </Text>
          <Heading level={2}>{current.title}</Heading>
        </VStack>
        <Stepper activeStep={step} orientation="horizontal" onStepClick={setStep} label="Setup">
          {STEPS.map((item, index) => (
            <Step key={item.label} step={index} label={item.label} />
          ))}
        </Stepper>
        <Text>{current.body}</Text>
        {current.code ? (
          <Text type="code" as="p">
            {current.code}
          </Text>
        ) : (
          <VStack gap={1}>
            {(Object.keys(TERMS) as TermKey[]).map((key) => (
              <Text key={key} type="supporting">
                <Term name={key} /> means {TERMS[key].plain.toLowerCase()}
              </Text>
            ))}
          </VStack>
        )}
        <HStack gap={2} wrap="wrap">
          {step > 0 ? <Button label="Back" variant="ghost" onClick={back} /> : null}
          {step < STEPS.length - 1 ? (
            <Button label="Next" variant="primary" onClick={next} />
          ) : (
            <Button label="Done" variant="primary" onClick={markDismissed} />
          )}
          <Button label="Skip setup" variant="ghost" onClick={markDismissed} />
        </HStack>
      </VStack>
    </Card>
  );
}
