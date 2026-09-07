import { IsArray, IsInt, IsOptional, IsString } from 'class-validator';

export class UpsertCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  // 这个分类属于哪些菜单版本；不传 = 不改动现有挂载，传空数组 = 清空（所有版本都显示）
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  menuProfileIds?: string[];
}
