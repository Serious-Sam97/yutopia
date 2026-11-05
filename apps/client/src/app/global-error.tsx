"use client";

// The root layout itself broke (docs/plan/72-the-3d-core.md, phase 1): no styles of ours can be
// trusted here, so it's plain — and a reload.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  console.error("[yutopia] the page broke:", error);
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#111216", color: "#efe4cc", font: "16px system-ui, sans-serif" }}>
        <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 24, textAlign: "center" }}>
          <div>
            <h1 style={{ fontWeight: 600 }}>Yutopia hit a bug</h1>
            <p style={{ opacity: 0.8 }}>Reload the page to come back in.</p>
            <button type="button" onClick={() => window.location.reload()} style={{ padding: "6px 16px" }}>
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
