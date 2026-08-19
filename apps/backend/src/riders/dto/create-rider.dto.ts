import { IsString, Length } from 'class-validator';

export class CreateRiderDto {
  @IsString()
  name: string;

  @IsString()
  @Length(4, 6)
  pin: string;
}
