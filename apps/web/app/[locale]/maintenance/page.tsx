export default function MaintenancePage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 720, width: "100%", textAlign: "center" }}>
        <h1 style={{ fontSize: 32, marginBottom: 12 }}>Estamos en mantenimiento</h1>
        <p style={{ fontSize: 16, opacity: 0.8 }}>
          Estamos haciendo ajustes para que tengas una mejor experiencia. Volvemos en breve. Gracias por tu paciencia.
        </p>
      </div>
    </main>
  );
}