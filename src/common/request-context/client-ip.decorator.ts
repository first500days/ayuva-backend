import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { clientIp } from './client-ip';

/**
 * The caller's public address, read through the proxy chain (x-forwarded-for)
 * the same way audit writes read it. Use instead of Nest's `@Ip()`, which
 * gives the proxy's own address on Render.
 */
export const ClientIp = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined =>
    clientIp(ctx.switchToHttp().getRequest<Request>()),
);
