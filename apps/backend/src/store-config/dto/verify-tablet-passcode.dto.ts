import { IsString } from 'class-validator';

export class VerifyTabletPasscodeDto {
  @IsString()
  passcode: string;
}
