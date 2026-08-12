import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateReservationDto {
  @IsString()
  customerName: string;

  @IsString()
  phone: string;

  @IsInt()
  @Min(1)
  partySize: number;

  @IsString()
  reservedTime: string;

  @IsOptional()
  @IsString()
  tableId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
