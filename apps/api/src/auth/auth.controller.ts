import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) { }

  @Post('register')
  register(@Body() body: { email: string; password: string; displayName: string }) {
    return this.auth.register(body);
  }

  @HttpCode(200)
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: any, @Query('locale') locale = 'es') {
    return this.auth.me(req.user.userId, locale);
  }

  @Patch('active-season')
  @UseGuards(JwtAuthGuard)
  setActiveSeason(@Req() req: any, @Body() body: { seasonId: string }) {
    return this.auth.setActiveSeason(req.user.userId, body.seasonId);
  }
}
