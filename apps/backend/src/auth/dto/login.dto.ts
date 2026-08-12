import { IsString, Length } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(4, 6)
  pin: string;
}
