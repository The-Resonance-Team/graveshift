import { useCallback } from 'react';
import { ListItem } from '@astryxdesign/core/List';

import { plannedWorkflows } from '../../fixtures/workflows';
import { workflowStatusLabel } from './workflow-parts';

type Workflow = (typeof plannedWorkflows)[number]['payload'];

export function WorkflowRow({
  workflow,
  isSelected,
  onSelect,
}: {
  workflow: Workflow;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const handleClick = useCallback(() => onSelect(workflow.id), [onSelect, workflow.id]);
  const note =
    workflow.validation.length === 0
      ? 'No validation notes in this sample.'
      : workflow.validation.join(' ');
  return (
    <ListItem
      label={`${workflow.name}, ${workflowStatusLabel(workflow.status)}`}
      description={`Version ${workflow.version}, ${workflow.steps.length} sample steps. ${note}`}
      onClick={handleClick}
      isSelected={isSelected}
    />
  );
}
