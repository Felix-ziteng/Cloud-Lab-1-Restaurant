import { IsInt, IsString, Matches, Min } from 'class-validator';

export class TabletOpenDto {
  @IsInt()
  @Min(1)
  partySize: number;

  @IsString()
  @Matches(/^\d{4}$/, { message: 'passcode 必须是 4 位数字' })
  passcode: string;
}
