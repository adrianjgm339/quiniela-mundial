import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

let cachedServer: any;

async function bootstrap() {
    if (cachedServer) return cachedServer;

    const app = await NestFactory.create(AppModule, { logger: false });
    await app.init();

    cachedServer = app.getHttpAdapter().getInstance(); // express instance
    return cachedServer;
}

function setCors(res: any, origin?: string) {
    const allowed =
        origin === 'https://quiniela-mundial-web.vercel.app' ||
        (origin && origin.endsWith('.vercel.app')) ||
        (origin && origin.startsWith('http://localhost:'));

    if (allowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: any, res: any) {
    setCors(res, req.headers?.origin);

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }

    const server = await bootstrap();
    return server(req, res);
}