import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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
}
