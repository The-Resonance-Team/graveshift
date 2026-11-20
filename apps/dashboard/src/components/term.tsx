'use client';

import { Text } from '@astryxdesign/core/Text';
import { Tooltip } from '@astryxdesign/core/Tooltip';

import { type TermKey, TERMS } from '../lib/terms';

// A themed label whose plain meaning is one hover or one Tab away.
export function Term({ name }: { name: TermKey }) {
  const { label, plain } = TERMS[name];
  return (
    <Tooltip content={plain} placement="above" focusTrigger="always" hasHoverIndication>
      <Text as="span" type="inherit" tabIndex={0} className="cursor-help">
        {label}
      </Text>
    </Tooltip>
  );
}
