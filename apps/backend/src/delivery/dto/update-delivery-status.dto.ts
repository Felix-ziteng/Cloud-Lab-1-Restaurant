import { IsIn } from 'class-validator';

export class UpdateDeliveryStatusDto {
  @IsIn(['delivering', 'delivered'])
  status: 'delivering' | 'delivered';
}
