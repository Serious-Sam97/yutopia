import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Cassette-stripe mark: walnut tile, rust/amber/olive/cream stripes, VFD "Y".
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#2a1b11",
        borderRadius: 36,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 16,
          height: 104,
          marginRight: 12,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <div style={{ flex: 1, background: "#b5562f" }} />
        <div style={{ flex: 1, background: "#e8a33d" }} />
        <div style={{ flex: 1, background: "#6e7b3a" }} />
        <div style={{ flex: 1, background: "#efe4cc" }} />
      </div>
      <div style={{ fontSize: 106, color: "#ffb35c", fontWeight: 700, lineHeight: 1 }}>Y</div>
    </div>,
    size,
  );
}
