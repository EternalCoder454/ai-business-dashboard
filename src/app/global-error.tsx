"use client";

/**
 * Replaces the root layout when the layout itself fails, so it has to bring its
 * own html and body. No app styles are guaranteed to be present here.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#1a1c1e",
          color: "#e3e2e6",
          fontFamily: "system-ui, sans-serif",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 500 }}>This workspace failed to start</h1>
          <p style={{ color: "#bfc6cb", marginTop: "0.5rem" }}>
            {error.message || "The application shell hit an error."}
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.625rem 1.25rem",
              borderRadius: "999px",
              border: "none",
              background: "#4fd8eb",
              color: "#00363d",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
