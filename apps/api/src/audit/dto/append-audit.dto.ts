import { AuditDraftSchema } from '@graveshift/core';
import { Type } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsString, ValidateBy, ValidateNested } from 'class-validator';

import { AuditDraftDto } from './audit-draft.dto';

export class AppendAuditDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => AuditDraftDto)
  @ValidateBy({
    name: 'auditDraft',
    validator: {
      validate: (value: unknown) => AuditDraftSchema.safeParse(value).success,
      defaultMessage: () => 'draft must match the audit contract',
    },
  })
  draft!: AuditDraftDto;
}
