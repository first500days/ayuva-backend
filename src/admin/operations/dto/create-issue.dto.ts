import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IssueDomain, IssueSeverity } from '../schemas/admin-issue.schema';
import type { AffectedEntity } from '../schemas/admin-issue.schema';

export class CreateIssueDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsEnum(IssueDomain)
  domain: IssueDomain;

  @IsEnum(IssueSeverity)
  @IsOptional()
  severity?: IssueSeverity;

  @IsOptional()
  affectedEntity: AffectedEntity;

  @IsString()
  @IsOptional()
  assignedTo?: string;

  @IsString()
  @IsOptional()
  slaDeadline?: string;

  @IsArray()
  @IsOptional()
  evidence?: string[];
}
