import { IsIn, IsString, Length } from 'class-validator';

export class CreateStaffDto {
  @IsString()
  name: string;

  @IsString()
  @Length(4, 6)
  pin: string;

  @IsIn(['staff', 'manager'])
  role: 'staff' | 'manager';
}
