import { IsString } from 'class-validator';

export class TransferTableSessionDto {
  @IsString()
  fromTableId: string;

  @IsString()
  toTableId: string;
}
