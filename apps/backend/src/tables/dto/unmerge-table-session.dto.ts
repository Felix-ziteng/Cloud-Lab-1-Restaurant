import { IsString } from 'class-validator';

export class UnmergeTableSessionDto {
  @IsString()
  tableId: string;
}
