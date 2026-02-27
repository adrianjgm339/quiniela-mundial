import { Body, Controller, Post } from '@nestjs/common';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';
import { WaitlistService } from './waitlist.service';

@Controller('waitlist')
export class WaitlistController {
    constructor(private readonly waitlist: WaitlistService) { }

    @Post()
    async create(@Body() dto: CreateWaitlistDto) {
        return this.waitlist.create(dto);
    }
}