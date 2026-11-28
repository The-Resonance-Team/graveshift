'use client';

import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Center } from '@astryxdesign/core/Center';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack, StackItem, VStack } from '@astryxdesign/core/Layout';
import { Link } from '@astryxdesign/core/Link';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Heading, Text } from '@astryxdesign/core/Text';

import { sampleAccounts } from '../../fixtures/identity';
import { SAMPLE_NOTICE } from '../../fixtures/sample';

const sampleAccount = sampleAccounts.find(({ id }) => id === 'account-owner')?.payload;
const linkColumns: { minWidth: number; repeat: 'fit' } = { minWidth: 200, repeat: 'fit' };

function errorStatus(message: string) {
  return { type: 'error' as const, message };
}

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({ email: '', password: '' });
  const [showPreview, setShowPreview] = useState(false);

  const emailStatus = useMemo(
    () => (errors.email === '' ? {} : { status: errorStatus(errors.email) }),
    [errors.email],
  );
  const passwordStatus = useMemo(
    () => (errors.password === '' ? {} : { status: errorStatus(errors.password) }),
    [errors.password],
  );

  const changeEmail = useCallback((value: string) => {
    setEmail(value);
    setErrors((current) => ({ ...current, email: '' }));
  }, []);

  const changePassword = useCallback((value: string) => {
    setPassword(value);
    setErrors((current) => ({ ...current, password: '' }));
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextErrors = {
        email: email.trim() === '' ? 'Enter the sample email you want to preview.' : '',
        password: password === '' ? 'Enter a sample password to preview the field state.' : '',
      };
      setErrors(nextErrors);
      setShowPreview(nextErrors.email === '' && nextErrors.password === '');
    },
    [email, password],
  );

  return (
    <Center role="main" axis="both" padding={6} minHeight="100%">
      <VStack gap={4} width={520} maxWidth="100%">
        <VStack gap={1}>
          <Text type="label" color="secondary">
            SAMPLE ACCESS
          </Text>
          <Heading level={1}>Sign in</Heading>
          <Text type="supporting" color="secondary">
            Review the fixture-only sign-in preview. No authentication request is made.
          </Text>
        </VStack>
        <Banner
          status="info"
          title="Simulation only"
          description={`${SAMPLE_NOTICE} No session is created and no password is verified.`}
        />
        <Card padding={5}>
          {showPreview && sampleAccount ? (
            <VStack gap={3}>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <StackItem size="fill">
                  <Heading level={2}>Sample account preview</Heading>
                </StackItem>
                <Badge label="No session" variant="neutral" />
              </HStack>
              <MetadataList>
                <MetadataListItem label="Email">{sampleAccount.email}</MetadataListItem>
                <MetadataListItem label="Organizations">
                  {sampleAccount.organizations.length} sample Organization
                </MetadataListItem>
                <MetadataListItem label="Password change">
                  {sampleAccount.mustChangePassword ? 'Required' : 'Not required'}
                </MetadataListItem>
              </MetadataList>
              <Text type="supporting" color="secondary">
                Nothing was verified. This is the Account record from the sample fixture.
              </Text>
              <HStack gap={3} wrap="wrap">
                <Link href="/onboarding">Preview onboarding</Link>
                <Link href="/settings/account">Preview account settings</Link>
              </HStack>
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
                    placeholder="owner@example.com"
                    value={email}
                    onChange={changeEmail}
                    {...emailStatus}
                  />
                  <TextInput
                    label="Password"
                    type="password"
                    htmlName="password"
                    autoComplete="current-password"
                    isRequired
                    placeholder="Sample value, never stored"
                    value={password}
                    onChange={changePassword}
                    {...passwordStatus}
                    description="Preview only. No password is checked or saved."
                  />
                </FormLayout>
                <Button label="Preview sign-in" variant="primary" type="submit" width="100%" />
                <Grid columns={linkColumns} gap={2}>
                  <Link href="/register">Create a sample account</Link>
                  <Link href="/settings/account">Required password change preview</Link>
                </Grid>
              </VStack>
            </form>
          )}
        </Card>
      </VStack>
    </Center>
  );
}
