import { IsBoolean, IsOptional } from 'class-validator';

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
}
