import { PartialType } from '@nestjs/swagger';
import { CreateDiagnosticTestDto } from './create-diagnostic-test.dto';

export class UpdateDiagnosticTestDto extends PartialType(CreateDiagnosticTestDto) {}