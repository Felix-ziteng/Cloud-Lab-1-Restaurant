import { IsString, Length } from 'class-validator';

export class ResetRiderPinDto {
  @IsString()
  @Length(4, 6)
  pin: string;
}
