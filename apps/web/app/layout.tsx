import "./globals.css";
import {getLocale} from "next-intl/server";

export default async function RootLayout({children}: {children: React.ReactNode}) {
  const locale = await getLocale();

  return (
    <html lang={locale} className="dark">
      <body className="min-h-screen bg-black text-white">
        {children}
      </body>
    </html>
  );
}
