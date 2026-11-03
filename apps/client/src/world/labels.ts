import { entry, type WorldObjectDef } from "@yutopia/shared";
import { tr } from "@/lib/i18n";

/** What a thing's called where you'd use it (the prompt, the focus): a present, who it's for
 *  (docs/plan/68-more-furniture.md, phase 2). */
export function thingLabel(o: WorldObjectDef): string {
  const name = o.kind === "present" ? String(o.props?.text ?? "") : "";
  return name ? tr("presentFor").replace("{name}", name) : entry(o.kind).label;
}
