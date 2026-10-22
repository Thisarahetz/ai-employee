import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SignupDto } from './dto/signup.dto';
import { SwitchTenantDto } from './dto/switch-tenant.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@CurrentTenant() tenant: TenantContext) {
    return this.authService.logout(tenant.userId);
  }

  @Post('switch-tenant')
  @HttpCode(HttpStatus.OK)
  switchTenant(@CurrentTenant() tenant: TenantContext, @Body() dto: SwitchTenantDto) {
    return this.authService.switchTenant(tenant.userId, dto.tenantId);
  }
}
