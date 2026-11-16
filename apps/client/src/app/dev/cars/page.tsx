"use client";

import { notFound } from "next/navigation";
import { useEffect, useRef } from "react";

// The cars' sheet (docs/plan/92-the-cars.md): every Blender model as the game draws it. Dev only (or a build
// with NEXT_PUBLIC_YUTOPIA_SHOTS=1).
//
//   /dev/cars                    the saloon
//   /dev/cars?v=van-camper&night=1&level=mid&role=police&x=roofrack,flaps&doors=1&lids=1

export default function CarsDev() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_YUTOPIA_SHOTS !== "1") notFound();
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cleanup = () => {};
    let stop = false;
    void (async () => {
      const el = host.current;
      if (!el) return;
      const S = await import("@/world/tp/car/sheet");
      if (stop) return;
      cleanup = await S.runSheet(el);
    })();
    return () => {
      stop = true;
      cleanup();
    };
  }, []);
  return <div ref={host} style={{ position: "fixed", inset: 0, background: "#111" }} />;
}
