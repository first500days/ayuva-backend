import { ApiProperty } from '@nestjs/swagger';

class PlainTermDto {
  @ApiProperty({ example: 'TSH' })
  term: string;

  @ApiProperty({
    example:
      'A hormone from the brain that tells your thyroid gland how hard to work.',
  })
  plain: string;
}

class ValueReadingDto {
  @ApiProperty({ example: 'Haemoglobin' })
  name: string;

  @ApiProperty({ example: 11.2 })
  value: number;

  @ApiProperty({ example: 'g/dL' })
  unit: string;

  @ApiProperty({ example: 12 })
  low: number;

  @ApiProperty({ example: 15 })
  high: number;

  @ApiProperty({
    enum: ['below', 'within', 'above'],
    description: 'Against the range printed on the same report',
  })
  position: 'below' | 'within' | 'above';
}

export class PlainLanguageResponseDto {
  @ApiProperty({
    description:
      'False for photos and scanned PDFs, which have no text to read yet',
  })
  textRead: boolean;

  @ApiProperty({ type: [PlainTermDto] })
  terms: PlainTermDto[];

  @ApiProperty({ type: [ValueReadingDto] })
  values: ValueReadingDto[];
}
