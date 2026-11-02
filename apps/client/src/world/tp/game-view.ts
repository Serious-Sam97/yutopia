// The game's way in to the 3D view (the controller's only import of it): the view, and
// the lot's cars' chunk (docs/plan/28-the-car.md) loaded from here — a child of the
// view's chunks, so what both draw with (light3d, wx3d, the lot's 3D, three's merging)
// isn't copied into it, as it was loaded from the page beside the view (~17 KB gzip).
// Not in view.ts: /dev/3p imports that, and would get a copy of the cars of its own.
export { ThirdPersonView } from "./view";
export const loadCars = () => import("../car/cars");
