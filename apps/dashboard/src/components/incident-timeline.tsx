'use client';

import { Card } from '@astryxdesign/core/Card';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Link } from '@astryxdesign/core/Link';
import { List, ListItem } from '@astryxdesign/core/List';
import { Step, Stepper } from '@astryxdesign/core/Stepper';
import { Text } from '@astryxdesign/core/Text';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';

import { PHASES, reachedPhases } from '../lib/data/incident-model';
import { RULE_TERM, TERMS, type TermKey } from '../lib/terms';
import type { IncidentView } from '../lib/types';
import { Term } from './term';

const PHASE_TERM: Record<(typeof PHASES)[number]['key'], TermKey | null> = {
  watcher: 'watcher',
  diagnoser: 'diagnoser',
  fixer: 'fixer',
  resolved: null,
  postmortem: 'postmortem',
};

export function IncidentTimeline({ view }: { view: IncidentView }) {
  const reached = reachedPhases(view);
  const activeStep = PHASES.reduce(
    (last, phase, index) => (reached.has(phase.key) ? index : last),
    0,
  );
  const themedRules = [
    ...new Set(
      view.detections.map((d) => RULE_TERM[d.rule]).filter((t): t is TermKey => t !== undefined),
    ),
  ];
  return (
    <VStack gap={5}>
      <Stepper activeStep={activeStep} label="Progress" density="compact">
        {PHASES.map((phase) => {
          const term = PHASE_TERM[phase.key];
          return (
            <Step
              key={phase.key}
              step={PHASES.indexOf(phase)}
              label={phase.label}
              description={term ? TERMS[term].label : 'Resolved'}
            />
          );
        })}
      </Stepper>

      {themedRules.length > 0 ? (
        <HStack gap={1} wrap="wrap">
          <Text type="supporting">Signs:</Text>
          {themedRules.map((term) => (
            <Token key={term} label={TERMS[term].label} color="orange" />
          ))}
        </HStack>
      ) : null}

      {view.incident.diagnosis ? (
        <Card>
          <VStack gap={2}>
            <HStack gap={2} wrap="wrap" vAlign="center">
              <Heading level={2}>
                <Term name="diagnosis" />
              </Heading>
              <Token label={view.category ?? 'unknown'} />
              <Token
                label={`${Math.round(view.incident.diagnosis.confidence * 100)}% confidence`}
              />
              <Token label={view.diagnosisSource ?? 'rules-only'} color="green" />
            </HStack>
            <Text>{view.incident.diagnosis.rootCause}</Text>
            <List hasDividers density="compact">
              {view.incident.diagnosis.evidence.map((item) => (
                <ListItem
                  key={item.ref}
                  itemKey={item.ref}
                  label={<Text type="code">{item.ref}</Text>}
                  description={<Text type="supporting">{item.excerpt}</Text>}
                />
              ))}
            </List>
          </VStack>
        </Card>
      ) : null}

      {view.needsHuman ? (
        <Token label={`Needs a human: ${view.needsHuman}`} color="orange" />
      ) : null}

      <Card>
        <VStack gap={2}>
          <Heading level={2}>
            <Term name="fixPr" />
          </Heading>
          {view.pr ? (
            <Link href={view.pr.url} isExternalLink>
              Draft PR #{view.pr.number} on {view.pr.branch.replace('refs/heads/', '')}
            </Link>
          ) : (
            <Text type="supporting">No draft pull request yet.</Text>
          )}
        </VStack>
      </Card>

      <VStack gap={2}>
        <Heading level={2}>Timeline</Heading>
        <List hasDividers density="compact">
          {view.timeline.map((entry) => (
            <ListItem
              key={`${entry.at}-${entry.type}`}
              label={<Text type="label">{entry.type}</Text>}
              description={<Text type="supporting">{entry.detail}</Text>}
              startContent={
                <VStack gap={0}>
                  <Timestamp
                    value={entry.at}
                    format="date_time"
                    timezoneID="Asia/Ho_Chi_Minh"
                    type="supporting"
                  />
                </VStack>
              }
            />
          ))}
        </List>
      </VStack>
    </VStack>
  );
}
