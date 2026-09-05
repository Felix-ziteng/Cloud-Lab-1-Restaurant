import { ALLERGEN_OPTIONS } from '@restaurant/shared-types';
import { IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

const ALLERGEN_IDS = ALLERGEN_OPTIONS.map((a) => a.id);

export class UpsertDishDto {
  @IsString()
  categoryId: string;

  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsIn([0, 1, 2, 3])
  spicyLevel?: number;

  @IsOptional()
  @IsArray()
  @IsIn(ALLERGEN_IDS, { each: true })
  allergens?: string[];

  // 这道菜适用哪些门店级选项组模板（见 ModifierGroup），不传/传 undefined 表示不改动现有挂载
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modifierGroupIds?: string[];
}
