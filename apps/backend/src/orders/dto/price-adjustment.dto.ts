import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class PriceAdjustmentDto {
  @IsIn(['discount', 'comp', 'void', 'price_override'])
  type: 'discount' | 'comp' | 'void' | 'price_override';

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  orderItemId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
