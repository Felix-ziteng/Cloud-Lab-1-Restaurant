import { ArrayNotEmpty, IsArray, IsInt, IsString, Min } from 'class-validator';

export class OpenTableSessionDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  tableIds: string[];

  @IsInt()
  @Min(1)
  partySize: number;
}
