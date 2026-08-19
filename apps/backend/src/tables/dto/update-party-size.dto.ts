import { IsInt, Min } from 'class-validator';

export class UpdatePartySizeDto {
  @IsInt()
  @Min(1)
  partySize: number;
}
