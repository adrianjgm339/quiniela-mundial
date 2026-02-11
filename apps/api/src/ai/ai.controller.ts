import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AiChatDto } from './dto/ai-chat.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @UseGuards(JwtAuthGuard)
  @Post('chat')
  async chat(@Req() req: Request, @Body() dto: AiChatDto) {
    const user = (req as any).user;
    return this.ai.chat(user, dto);
  }
}
