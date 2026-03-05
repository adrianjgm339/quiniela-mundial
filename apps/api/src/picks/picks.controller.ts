import {
  Body,
  Controller,
  Get,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UpsertPickDto } from './dto/upsert-pick.dto';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PicksService } from './picks.service';

@Controller('picks')
@UseGuards(JwtAuthGuard)
export class PicksController {
  constructor(private readonly picks: PicksService) {}

  @Get()
  list(@Req() req: any, @Query('leagueId') leagueId: string) {
    const userId = req.user.userId ?? req.user.id ?? req.user.sub;
    return this.picks.list({ userId, leagueId });
  }

  @Put()
  upsert(
    @Req() req: any,
    @Body()
    body: UpsertPickDto,
  ) {
    const userId = req.user.userId ?? req.user.id ?? req.user.sub;
    return this.picks.upsert({ userId, ...body });
  }
}
