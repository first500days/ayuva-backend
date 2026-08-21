import { Body, Controller, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleOAuthDto } from './dto/google-oauth.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ConsentDto } from './dto/consent.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthTokensResponseDto } from './dto/auth-tokens-response.dto';
import { RefreshTokenResponseDto } from './dto/refresh-token-response.dto';
import { ConsentStatusResponseDto } from './dto/consent-status-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Email/password sign-up (FR-1.2, FR-1.5)' })
  @ApiCreatedResponse({ type: AuthTokensResponseDto })
  register(@Body() dto: RegisterDto): Promise<AuthTokensResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email/password login (FR-1.1)' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  login(@Body() dto: LoginDto): Promise<AuthTokensResponseDto> {
    return this.authService.login(dto);
  }

  @Post('oauth/google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Google OAuth sign-up/sign-in (FR-1.3)' })
  @ApiOkResponse({ type: AuthTokensResponseDto })
  oauthGoogle(@Body() dto: GoogleOAuthDto): Promise<AuthTokensResponseDto> {
    return this.authService.oauthGoogle(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for a new token pair' })
  @ApiOkResponse({ type: RefreshTokenResponseDto })
  refresh(@Body() dto: RefreshTokenDto): Promise<RefreshTokenResponseDto> {
    return this.authService.refresh(dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using a reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.authService.resetPassword(dto);
  }

  @Put('consent')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Re-accept the current consent version (FR-1.5) — the only recovery path when ConsentGuard rejects a stale-consent user',
  })
  @ApiOkResponse({ type: ConsentStatusResponseDto })
  updateConsent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConsentDto,
  ): Promise<ConsentStatusResponseDto> {
    return this.authService.updateConsent(user.sub, dto);
  }
}
