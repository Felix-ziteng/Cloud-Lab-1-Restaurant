import { IsIn, IsNumber, Min } from 'class-validator';

export class RecordPaymentDto {
  @IsIn(['cash', 'staff_qr', 'rider_cod'])
  method: 'cash' | 'staff_qr' | 'rider_cod';

  @IsNumber()
  @Min(0)
  amount: number;
}
