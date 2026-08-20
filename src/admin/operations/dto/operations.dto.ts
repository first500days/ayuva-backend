import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { IssueDomain, IssueSeverity, IssueStatus } from '../schemas/admin-issue.schema';

export class UpdateIssueDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(IssueSeverity)
  @IsOptional()
  severity?: IssueSeverity;

  @IsEnum(IssueStatus)
  @IsOptional()
  status?: IssueStatus;

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

export class QueryIssuesDto {
  @IsEnum(IssueDomain)
  @IsOptional()
  domain?: IssueDomain;

  @IsEnum(IssueSeverity)
  @IsOptional()
  severity?: IssueSeverity;

  @IsEnum(IssueStatus)
  @IsOptional()
  status?: IssueStatus;

  @IsString()
  @IsOptional()
  search?: string;
}

export class ResolveIssueDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsNotEmpty()
  outcome: string;
}

export class AddTimelineEventDto {
  @IsString()
  @IsNotEmpty()
  action: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
