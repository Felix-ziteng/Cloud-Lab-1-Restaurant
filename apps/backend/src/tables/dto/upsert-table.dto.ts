import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class UpsertTableDto {
  @IsString()
  tableNumber: string;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsString()
  @Matches(/^\d{4}$/, { message: 'passcode 必须是 4 位数字' })
  passcode: string;
}
