import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Guards routes with the `jwt` passport strategy. Register/login endpoints land in Phase 2. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
