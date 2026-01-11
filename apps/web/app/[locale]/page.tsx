import Link from "next/link";

export default function Home({
  params,
}: {
  params: { locale: string };
}) {
  const locale = params.locale ?? "es";

  return (
    <main style={{ padding: 24 }}>
      <h1>Quiniela</h1>
      <p>Home por idioma (pronto).</p>
      <Link href={`/${locale}/login`}>Ir a login</Link>
    </main>
  );
}
