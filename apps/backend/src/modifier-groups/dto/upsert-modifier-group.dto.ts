import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class ModifierOptionInput {
  @IsString()
  label: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceDelta?: number;
}

export class UpsertModifierGroupDto {
  @IsString()
  name: string;

  @IsIn(['single_required', 'single_optional', 'multiple'])
  selectionType: 'single_required' | 'single_optional' | 'multiple';

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ModifierOptionInput)
  options: ModifierOptionInput[];
}
