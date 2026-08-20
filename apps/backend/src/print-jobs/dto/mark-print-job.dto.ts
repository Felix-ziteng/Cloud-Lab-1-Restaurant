import { IsIn, IsOptional, IsString } from 'class-validator';

export class MarkPrintJobDto {
  @IsIn(['printed', 'failed'])
  status: 'printed' | 'failed';

  @IsOptional()
  @IsString()
  errorMessage?: string;
}
