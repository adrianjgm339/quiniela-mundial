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

  // CORS: el "origin" NO incluye path (ej: NO "/es").
  // Además, los Preview de Vercel cambian de subdominio, así que usamos regex.
  app.enableCors({
    origin: (origin, cb) => {
      // Permite requests sin Origin (curl/postman/healthchecks)
      if (!origin) return cb(null, true);
 
      const allowList = new Set<string>([
        'https://quiniela-mundial-web.vercel.app',
        'https://quiniela-mundial-we.vercel.app',
        'http://localhost:3000',
      ]);
 
      // Permite previews del proyecto web (Vercel) con variaciones del subdominio
      const isWebPreview = /^https:\/\/quiniela-mundial-we-.*\.vercel\.app$/i.test(
        origin,
      );
 
      // Importante: devolver el ORIGIN (string) para que el middleware emita:
      // Access-Control-Allow-Origin: <origin>
      if (allowList.has(origin) || isWebPreview) return cb(null, origin);
 
      return cb(new Error(`CORS blocked: ${origin}`), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders:'Content-Type, Authorization, Accept, Origin, X-Requested-With',
    credentials: true,
  });

  await app.listen(3001);
  console.log(`API running on http://localhost:3001`);
}

bootstrap();