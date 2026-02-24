import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

let cachedHandler: any;

async function bootstrap() {
    if (cachedHandler) return cachedHandler;

    const app = await NestFactory.create(AppModule, { logger: false });
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true); // curl/postman
            if (
                origin === 'https://quiniela-mundial-web.vercel.app' ||
                origin.endsWith('.vercel.app') ||
                origin.startsWith('http://localhost:')
            ) {
                return callback(null, true);
            }
            return callback(new Error(`CORS blocked for origin: ${origin}`), false);
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
        maxAge: 86400,
    });

    await app.init();

    // Nest usa Express por defecto
    const server = app.getHttpAdapter().getInstance();
    cachedHandler = server;
    return cachedHandler;
}

export default async function handler(req: any, res: any) {
    const server = await bootstrap();

    res.setHeader('Access-Control-Allow-Origin', 'https://quiniela-mundial-web.vercel.app');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }

    return server(req, res);
}