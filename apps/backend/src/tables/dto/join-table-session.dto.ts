import { IsInt, IsOptional, Min } from 'class-validator';

export class JoinTableSessionDto {
  // 顾客首次扫码开台时填写；加入已有会话时可省略
  @IsOptional()
  @IsInt()
  @Min(1)
  partySize?: number;
}
