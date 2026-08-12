import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { AuthPayload } from '../auth.types';

export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthPayload => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.auth!;
});
