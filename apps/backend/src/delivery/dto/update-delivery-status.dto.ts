import { IsIn } from 'class-validator';

export class UpdateDeliveryStatusDto {
  @IsIn(['picked_up', 'delivering', 'delivered'])
  status: 'picked_up' | 'delivering' | 'delivered';
}
