import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpsertTableDto {
  @IsString()
  tableNumber: string;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsOptional()
  @IsString()
  zone?: string;
}
