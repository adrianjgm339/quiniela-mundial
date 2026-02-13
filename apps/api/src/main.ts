import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 1) intenta .env en CWD (si arrancas desde apps/api)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// 2) intenta .env del monorepo (si arrancas desde la raíz)
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ['http://localhost:3000'],
    credentials: true,
  });


  await app.listen(3001);
  console.log(`API running on http://localhost:3001`);
}
bootstrap();
