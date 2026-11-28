import { VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';

import type { PlannedWorkflow, PlannedWorkflowStep } from '../../fixtures/workflows';

const STATUS_LABEL = {
  draft: 'Draft',
  published: 'Published',
  invalid: 'Invalid',
} as const;

const STATUS_COLOR = {
  draft: 'blue',
  published: 'green',
  invalid: 'red',
} as const;

const STEP_KIND_LABEL = {
  trigger: 'Trigger',
  inspect: 'Inspect',
  notify: 'Notify',
  human_review: 'Human review',
} as const;

const SAFEGUARDS = [
  { label: 'Authorization', detail: 'Roles and Scopes stay with the Account and Project.' },
  { label: 'Policy', detail: 'Rules outside the workflow decide which actions are allowed.' },
  { label: 'Audit chain', detail: 'Decisions are recorded outside the editable steps.' },
  {
    label: 'Sandbox verification',
    detail: 'Changes are checked in a sandbox before any wider effect.',
  },
  { label: 'Approval', detail: 'A human approves runtime actions separately.' },
] as const;

export function workflowStatusLabel(status: PlannedWorkflow['status']): string {
  return STATUS_LABEL[status];
}

export function WorkflowStatus({ status }: { status: PlannedWorkflow['status'] }) {
  return <Token size="sm" color={STATUS_COLOR[status]} label={STATUS_LABEL[status]} />;
}

export function stepKindLabel(kind: PlannedWorkflowStep['kind']): string {
  return STEP_KIND_LABEL[kind];
}

export function WorkflowSteps({ steps }: { steps: readonly PlannedWorkflowStep[] }) {
  if (steps.length === 0) {
    return <Text color="secondary">No steps in this sample.</Text>;
  }
  return (
    <List density="compact" hasDividers listStyle="decimal">
      {steps.map((step) => (
        <ListItem
          key={step.id}
          label={step.title}
          description={`${stepKindLabel(step.kind)}, ${step.summary}`}
        />
      ))}
    </List>
  );
}

export function WorkflowValidation({ validation }: { validation: readonly string[] }) {
  return (
    <VStack gap={2}>
      <Heading level={3}>Validation</Heading>
      {validation.length === 0 ? (
        <Text color="secondary">No validation notes in this sample.</Text>
      ) : (
        <List density="compact" hasDividers>
          {validation.map((message) => (
            <ListItem key={message} label={message} />
          ))}
        </List>
      )}
      <Text type="supporting" color="secondary">
        Sample validation text. No live check was run.
      </Text>
    </VStack>
  );
}

export function WorkflowSafeguards({ headingLevel = 3 }: { headingLevel?: 2 | 3 | 4 }) {
  return (
    <VStack gap={2}>
      <Heading level={4} accessibilityLevel={headingLevel}>
        Safeguards outside the workflow
      </Heading>
      <Text color="secondary">A workflow cannot grant its own permissions.</Text>
      <List density="compact" hasDividers>
        {SAFEGUARDS.map(({ label, detail }) => (
          <ListItem key={label} label={label} description={detail} />
        ))}
      </List>
    </VStack>
  );
}
