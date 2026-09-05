import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class TabletOpenDto {
  // 桌已被占用（比如前台已经开台）时前端不会传这个字段，joinOrAutoOpen 对已占用桌本来就忽略 partySize
  @IsOptional()
  @IsInt()
  @Min(1)
  partySize?: number;

  @IsString()
  @Matches(/^\d{4}$/, { message: 'passcode 必须是 4 位数字' })
  passcode: string;
}
