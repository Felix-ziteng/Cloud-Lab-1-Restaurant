import { IsBoolean, IsIn, IsOptional, Matches } from 'class-validator';

export class UpdateStoreConfigDto {
  @IsOptional()
  @IsBoolean()
  kdsScreenEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  deliveryEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  reservationEnabled?: boolean;

  @IsOptional()
  @IsIn(['modern', 'warm'])
  uiTheme?: 'modern' | 'warm';

  @IsOptional()
  @IsIn(['compact', 'browse'])
  tabletMenuLayout?: 'compact' | 'browse';

  // 明文传进来，service 层现场哈希存库，绝不落盘明文
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'tabletOpenPasscode 必须是 4 位数字' })
  tabletOpenPasscode?: string;
}
