import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class MergeTableSessionDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  additionalTableIds: string[];
}
