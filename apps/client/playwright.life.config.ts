// The e2e specs in the life look (docs/plan/73): the same config, every spec's own page opened with
// localStorage["yutopia:look"] = "life" (look/look-mode.ts). Pages a spec opens in a context of its own
// (browser.newContext — a second viewer) stay in the classic look. On the machine's GPU (Metal): the life
// look's Standard materials and AO on Chrome's software GPU stalled the specs' walks past their timeouts.
//   npx playwright test -c playwright.life.config.ts e2e/lighting.spec.ts …
import base from "./playwright.config";

const origin = new URL(process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100").origin;

export default {
  ...base,
  use: {
    ...base.use,
    launchOptions: {
      args: [...(base.use?.launchOptions?.args ?? []), "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
    },
    storageState: { cookies: [], origins: [{ origin, localStorage: [{ name: "yutopia:look", value: "life" }] }] },
  },
};
