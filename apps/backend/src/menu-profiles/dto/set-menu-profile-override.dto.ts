import { IsOptional, IsString } from 'class-validator';

export class SetMenuProfileOverrideDto {
  // null/不传 = 恢复自动判断
  @IsOptional()
  @IsString()
  profileId: string | null;
}
