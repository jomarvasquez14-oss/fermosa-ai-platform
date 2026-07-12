"use client";

/**
 * Last-resort error boundary — replaces the root layout when it crashes,
 * so it must render its own <html>/<body> and cannot rely on app providers.
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
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", padding: "1rem" }}>
          <p style={{ letterSpacing: "0.2em", color: "#737373", fontSize: "0.875rem" }}>500</p>
          <h1 style={{ fontSize: "1.5rem", margin: "0.5rem 0" }}>Application error</h1>
          <p style={{ color: "#737373", marginBottom: "1.5rem" }}>
            A critical error occurred{error.digest ? ` (ref: ${error.digest})` : ""}.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              border: "1px solid #d4d4d4",
              background: "#171717",
              color: "#fafafa",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
