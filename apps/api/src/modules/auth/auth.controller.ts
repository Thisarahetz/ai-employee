import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentTenant } from '../../common/tenant/current-tenant.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { TenantContext } from '../../common/tenant/tenant-context';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SignupDto } from './dto/signup.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Public()
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
}
