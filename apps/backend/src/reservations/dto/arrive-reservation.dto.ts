import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ArriveReservationDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  tableIds: string[];
}
