import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpsertCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
