import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { PlanTier, SubscriptionStatus } from '../schemas/subscription.schema';

export class CreatePlanDto {
  @ApiProperty() @IsString() @MinLength(2) name: string;
  @ApiProperty({ enum: PlanTier }) @IsEnum(PlanTier) tier: PlanTier;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) priceMonthly?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ description: 'e.g. { familyMembers: 5, storageGb: 10 }; null = unlimited' })
  @IsOptional()
  @IsObject()
  limits?: Record<string, number | null>;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdatePlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) priceMonthly?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  limits?: Record<string, number | null>;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class QuerySubscriptionsDto {
  @ApiPropertyOptional({ enum: PlanTier })
  @IsOptional()
  @IsEnum(PlanTier)
  tier?: PlanTier;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}

export class AssignSubscriptionDto {
  @ApiProperty() @IsString() userId: string;
  @ApiProperty() @IsString() planId: string;
}

export class UpdateSubscriptionDto {
  @ApiProperty({ enum: ['cancel', 'reactivate'] })
  @IsIn(['cancel', 'reactivate'])
  action: 'cancel' | 'reactivate';
}
