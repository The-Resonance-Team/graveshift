'use client';

import { FormLayout } from '@astryxdesign/core/FormLayout';
import { Link } from '@astryxdesign/core/Link';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';

export type StepKey = 'password' | 'organization' | 'project' | 'checklist';

type Setter = (value: string) => void;

interface ChecklistItem {
  label: string;
  value: string;
}

interface StepFieldsProps {
  stepKey: StepKey;
  projectOptions: Array<{ value: string; label: string }>;
  checklistItems: ChecklistItem[];
  orgName: string;
  setOrgName: Setter;
  orgSlug: string;
  setOrgSlug: Setter;
  projectMode: string;
  setProjectMode: Setter;
  selectedProject: string;
  setSelectedProject: Setter;
  newProjectName: string;
  setNewProjectName: Setter;
  newProjectSlug: string;
  setNewProjectSlug: Setter;
  newPassword: string;
  setNewPassword: Setter;
  confirmPassword: string;
  setConfirmPassword: Setter;
  sourceMode: string;
  setSourceMode: Setter;
}

export function StepFields(props: StepFieldsProps) {
  if (props.stepKey === 'password') {
    return (
      <VStack gap={3}>
        <VStack gap={1}>
          <Heading level={2}>Change password</Heading>
          <Text type="supporting" color="secondary">
            Required for the selected sample Account. No value is stored or verified.
          </Text>
        </VStack>
        <FormLayout defaultOptionality="required">
          <TextInput
            label="New sample password"
            type="password"
            autoComplete="new-password"
            isRequired
            value={props.newPassword}
            onChange={props.setNewPassword}
            description="At least 8 characters. Preview only."
          />
          <TextInput
            label="Confirm sample password"
            type="password"
            autoComplete="new-password"
            isRequired
            value={props.confirmPassword}
            onChange={props.setConfirmPassword}
          />
        </FormLayout>
      </VStack>
    );
  }

  if (props.stepKey === 'organization') {
    return (
      <VStack gap={3}>
        <VStack gap={1}>
          <Heading level={2}>Create or select an Organization</Heading>
          <Text type="supporting" color="secondary">
            Name a sample Organization that would own your Projects.
          </Text>
        </VStack>
        <FormLayout defaultOptionality="required">
          <TextInput
            label="Organization name"
            isRequired
            value={props.orgName}
            onChange={props.setOrgName}
            placeholder="Sample Operations"
          />
          <TextInput
            label="Slug"
            isRequired
            value={props.orgSlug}
            onChange={props.setOrgSlug}
            placeholder="sample-operations"
            description="Lowercase letters, numbers, and hyphens."
          />
        </FormLayout>
      </VStack>
    );
  }

  if (props.stepKey === 'project') {
    return (
      <VStack gap={3}>
        <VStack gap={1}>
          <Heading level={2}>Select or create a Project</Heading>
          <Text type="supporting" color="secondary">
            Both sample Projects belong to the Organization in the identity fixture.
          </Text>
        </VStack>
        <RadioList label="Project choice" value={props.projectMode} onChange={props.setProjectMode}>
          <RadioListItem
            label="Select a sample Project"
            value="select"
            description="Use a Project already in the fixture."
          />
          <RadioListItem
            label="Create a sample Project"
            value="create"
            description="Preview the fields without saving."
          />
        </RadioList>
        {props.projectMode === 'select' ? (
          <Selector
            label="Sample Project"
            options={props.projectOptions}
            value={props.selectedProject}
            onChange={props.setSelectedProject}
            placeholder="Choose a Project"
          />
        ) : (
          <FormLayout defaultOptionality="required">
            <TextInput
              label="Project name"
              isRequired
              value={props.newProjectName}
              onChange={props.setNewProjectName}
              placeholder="New sample Project"
            />
            <TextInput
              label="Project slug"
              isRequired
              value={props.newProjectSlug}
              onChange={props.setNewProjectSlug}
              placeholder="new-sample-project"
            />
          </FormLayout>
        )}
      </VStack>
    );
  }

  return (
    <VStack gap={3}>
      <VStack gap={1}>
        <Heading level={2}>Overview checklist</Heading>
        <Text type="supporting" color="secondary">
          Review the sample setup before opening Overview. Connecting a source can be deferred.
        </Text>
      </VStack>
      <MetadataList>
        {props.checklistItems.map((item) => (
          <MetadataListItem key={item.label} label={item.label}>
            {item.value}
          </MetadataListItem>
        ))}
      </MetadataList>
      <RadioList label="Source timing" value={props.sourceMode} onChange={props.setSourceMode}>
        <RadioListItem
          label="Add a source later"
          value="later"
          description="Leave the sample workspace without a source."
        />
        <RadioListItem
          label="Preview source connection"
          value="preview"
          description="Shows a placeholder only; nothing is connected."
        />
      </RadioList>
      {props.sourceMode === 'preview' && (
        <Text color="secondary">No source is connected. A connection panel would appear here.</Text>
      )}
      <Link href="/overview">Open the sample Overview</Link>
    </VStack>
  );
}
