'use client';

import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Center } from '@astryxdesign/core/Center';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Heading, Text } from '@astryxdesign/core/Text';

import { sampleAccounts } from '../../fixtures/identity';
import { SAMPLE_NOTICE } from '../../fixtures/sample';

const newAccount = sampleAccounts.find(({ id }) => id === 'account-new')?.payload;
const registeredEmails = sampleAccounts.map(({ payload }) => payload.email);

function errorStatus(message: string) {
  return { type: 'error' as const, message };
}

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const emailStatus = useMemo(() => (error === '' ? {} : { status: errorStatus(error) }), [error]);

  const changeEmail = useCallback((value: string) => {
    setEmail(value);
    setError('');
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const value = email.trim().toLowerCase();
      if (value === '') {
        setError('Enter the sample email you want to preview.');
        setShowPreview(false);
        return;
      }
      if (registeredEmails.includes(value)) {
        setError('This email already exists in the fixture set. Try another sample value.');
        setShowPreview(false);
        return;
      }
      setError('');
      setShowPreview(true);
    },
    [email],
  );

  return (
    <Center role="main" axis="both" padding={6} minHeight="100%">
      <VStack gap={4} width={520} maxWidth="100%">
        <VStack gap={1}>
          <Text type="label" color="secondary">
            SAMPLE ACCESS
          </Text>
          <Heading level={1}>Create an account</Heading>
          <Text type="supporting" color="secondary">
            Review the fixture-only registration preview. No account is created.
          </Text>
        </VStack>
        <Banner
          status="info"
          title="Simulation only"
          description={`${SAMPLE_NOTICE} No password is collected and no account is saved.`}
        />
        <Card padding={5}>
          {showPreview && newAccount ? (
            <VStack gap={3}>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <StackItem size="fill">
                  <Heading level={2}>Sample account preview</Heading>
                </StackItem>
                <Badge label="Not created" variant="neutral" />
              </HStack>
              <MetadataList>
                <MetadataListItem label="Email">{newAccount.email}</MetadataListItem>
                <MetadataListItem label="Organizations">
                  {newAccount.organizations.length} sample Organization
                </MetadataListItem>
                <MetadataListItem label="Next step">Create an Organization</MetadataListItem>
              </MetadataList>
              <Text type="supporting" color="secondary">
                The email you entered was not stored. The fixture record has no Organization yet.
              </Text>
              <Link href="/onboarding">Preview onboarding</Link>
            </VStack>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <VStack gap={4}>
                <FormLayout defaultOptionality="required">
                  <TextInput
                    label="Email"
                    type="email"
                    htmlName="email"
                    autoComplete="username"
                    isRequired
                    placeholder="you@example.com"
                    value={email}
                    onChange={changeEmail}
                    {...emailStatus}
                    description="Conflict preview uses the email values in the identity fixture."
                  />
                </FormLayout>
                <Button label="Preview registration" variant="primary" type="submit" width="100%" />
                <Link href="/sign-in">Back to sign-in preview</Link>
              </VStack>
            </form>
          )}
        </Card>
      </VStack>
    </Center>
  );
}
