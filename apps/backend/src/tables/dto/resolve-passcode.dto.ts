import { IsString, Matches } from 'class-validator';

export class ResolvePasscodeDto {
  @IsString()
  @Matches(/^\d{4}$/, { message: 'passcode 必须是 4 位数字' })
  passcode: string;
}
