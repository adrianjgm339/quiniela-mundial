import {
  Controller,
  Patch,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Patch('me/active-season')
  setActiveSeason(
    @Req() req,
    @Body() body: { seasonId: string },
  ) {
    return this.usersService.setActiveSeason(
      req.user.userId,
      body.seasonId,
    );
  }
}
