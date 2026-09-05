import { IsBoolean, IsIn, IsOptional } from 'class-validator';

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

  @IsOptional()
  @IsBoolean()
  showSpicyLevel?: boolean;

  @IsOptional()
  @IsBoolean()
  showAllergens?: boolean;
}
