// The name, by a street lamp (docs/plan/45-the-ui.md).
export function Brand({ small = false, compact = false }: { small?: boolean; compact?: boolean }) {
  const lamp = small ? 28 : 38;
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg viewBox="0 0 46 46" width={lamp} height={lamp} aria-hidden="true" style={{ color: "var(--amber)" }}>
        <path d="M23 6 V40" stroke="currentColor" strokeWidth="1.8" />
        <path d="M23 9 H33 L35 13 H25" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M27 13 L22 30 H44 L37 13" fill="currentColor" fillOpacity=".16" />
      </svg>
      <span
        className={`leading-none ${compact ? "hidden sm:inline" : ""}`}
        style={{
          fontFamily: "var(--font-title)",
          fontWeight: 600,
          letterSpacing: "0.2em",
          fontSize: small ? 24 : 34,
          color: "var(--cream)",
        }}
      >
        YUTOPIA
      </span>
    </div>
  );
}
