import type { AvatarLayers } from "@yutopia/shared";

// Someone drawn flat in their own colours (docs/plan/72-the-3d-core.md, phase 12: the paper people
// retired) — for the HUD's pictures where WebGL can't draw their 3D person: a head in their skin
// under their hair, their top, their trousers. `face`: the head and shoulders, a portrait's.

const esc = (c: string) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : "#888");

/** The figure (or its head and shoulders) as an SVG data URL. */
export function flatFigure(a: AvatarLayers, face = false): string {
  const skin = esc(a.skin);
  const hair = esc(a.hairColor);
  const top = esc(a.outer && a.outer !== "none" ? a.outerColor : a.topColor);
  const legs = esc(a.bottomColor);
  const shoes = esc(a.shoesColor);
  const bald = a.hair === "none" || a.hair === "bald";
  const body = `
    <rect x="22" y="58" width="8" height="34" rx="3" fill="${legs}"/>
    <rect x="34" y="58" width="8" height="34" rx="3" fill="${legs}"/>
    <ellipse cx="26" cy="93" rx="6" ry="3" fill="${shoes}"/>
    <ellipse cx="38" cy="93" rx="6" ry="3" fill="${shoes}"/>
    <rect x="17" y="27" width="30" height="35" rx="10" fill="${top}"/>
    <rect x="12" y="30" width="7" height="26" rx="3.5" fill="${top}"/>
    <rect x="45" y="30" width="7" height="26" rx="3.5" fill="${top}"/>
    <circle cx="15.5" cy="57" r="3.5" fill="${skin}"/>
    <circle cx="48.5" cy="57" r="3.5" fill="${skin}"/>`;
  const head = `
    <rect x="28" y="20" width="8" height="8" fill="${skin}"/>
    <circle cx="32" cy="14" r="10" fill="${skin}"/>
    ${bald ? "" : `<path d="M22 14 a10 10 0 0 1 20 0 q-10 -5 -20 0z" fill="${hair}"/>`}`;
  const svg = face
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 2 28 28"><rect x="17" y="24" width="30" height="20" rx="10" fill="${top}"/>${head}</svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 100">${body}${head}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
