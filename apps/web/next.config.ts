import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
    async redirects() {
        const on = process.env.MAINTENANCE_MODE === '1';
        if (!on) return [];

        // App Router con locale en la URL: /es/..., /en/...
        // Evita loop permitiendo /:locale/maintenance
        return [
            {
                source: '/:locale/:path((?!maintenance|_next|api).*)',
                destination: '/:locale/maintenance',
                permanent: false, // 307
            },
        ];
    },
};

export default withNextIntl(nextConfig);
