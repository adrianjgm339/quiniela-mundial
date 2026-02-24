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

function setCors(req: any, res: any) {
    const origin = req.headers?.origin as string | undefined;

    const allowed =
        origin === 'https://quiniela-mundial-web.vercel.app' ||
        (typeof origin === 'string' && origin.endsWith('.vercel.app')) ||
        (typeof origin === 'string' && origin.startsWith('http://localhost:'));

    // SIEMPRE setea Allow-Origin (esto evita el error que viste)
    // Si el origin es permitido, reflejamos el origin real.
    // Si no, fijamos el origin prod (mejor que dejarlo vacío).
    const allowOrigin =
        allowed && origin ? origin : 'https://quiniela-mundial-web.vercel.app';

    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Vary', 'Origin');

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');

    // Refleja headers solicitados por el preflight (clave)
    const reqHeaders = req.headers?.['access-control-request-headers'];
    res.setHeader(
        'Access-Control-Allow-Headers',
        reqHeaders ? reqHeaders : 'Content-Type, Authorization'
    );
}

export default async function handler(req: any, res: any) {
    setCors(req, res);

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        return res.end();
    }

    const server = await bootstrap();
    return server(req, res);
}