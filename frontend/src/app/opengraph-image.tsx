import { ImageResponse } from "next/og";

export const alt = "ContextSOP — turn incident noise into reliable action";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ background: "#07111f", color: "#edf6ff", display: "flex", height: "100%", width: "100%", padding: "76px", flexDirection: "column", justifyContent: "space-between", fontFamily: "sans-serif", backgroundImage: "radial-gradient(circle at 80% 10%, #33255f 0, transparent 32%)" }}>
      <div style={{ color: "#43e8a6", display: "flex", fontSize: 30, fontWeight: 700, letterSpacing: "0.08em" }}>CONTEXT<span style={{ color: "#b69cff" }}>SOP</span></div>
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ fontSize: 78, letterSpacing: "-0.06em", lineHeight: 1, fontWeight: 700 }}>Turn incident noise into reliable action.</div>
        <div style={{ color: "#9cadc1", fontSize: 30 }}>Living, validated runbooks for high-pressure operations.</div>
      </div>
      <div style={{ display: "flex", color: "#f4bf63", fontSize: 24 }}>RAW INCIDENT TO STRUCTURED SOP</div>
    </div>,
    size,
  );
}
