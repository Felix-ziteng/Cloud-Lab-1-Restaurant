import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

class MenuProfileRuleDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsIn([0, 1, 2, 3, 4, 5, 6], { each: true })
  daysOfWeek: number[];

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime 必须是 HH:mm 格式' })
  startTime: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'endTime 必须是 HH:mm 格式' })
  endTime: string;
}

export class UpsertMenuProfileDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MenuProfileRuleDto)
  rules?: MenuProfileRuleDto[];
}
