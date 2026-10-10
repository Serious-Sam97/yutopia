export function Brand({ small = false, compact = false }: { small?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <span
        aria-hidden
        className="tape-stripes inline-block rounded-sm"
        style={{ width: small ? 6 : 8, height: small ? 22 : 30 }}
      />
      <span className={`lcd leading-none ${compact ? "hidden sm:inline" : ""}`} style={{ fontSize: small ? 26 : 38 }}>
        YUTOPIA
      </span>
    </div>
  );
}
