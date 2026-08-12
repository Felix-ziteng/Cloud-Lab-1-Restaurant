import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('staff/login')
  staffLogin(@Body() dto: LoginDto) {
    return this.authService.staffLogin(dto.pin);
  }

  @Post('rider/login')
  riderLogin(@Body() dto: LoginDto) {
    return this.authService.riderLogin(dto.pin);
  }
}
