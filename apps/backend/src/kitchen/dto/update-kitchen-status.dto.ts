import { IsIn } from 'class-validator';

export class UpdateKitchenStatusDto {
  @IsIn(['preparing', 'done'])
  status: 'preparing' | 'done';
}
