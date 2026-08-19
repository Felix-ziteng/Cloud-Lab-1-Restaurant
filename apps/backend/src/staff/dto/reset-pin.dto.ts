import { IsString, Length } from 'class-validator';

export class ResetPinDto {
  @IsString()
  @Length(4, 6)
  pin: string;
}
