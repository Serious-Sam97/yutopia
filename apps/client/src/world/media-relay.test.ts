import assert from "node:assert/strict";
import { test } from "node:test";
import { afterFailedOpen, tlsRelay, WORLD_TRIES } from "./media";

// What Cloudflare's generate-ice-servers hands out (the credentials made up).
const cloudflare: RTCIceServer[] = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:443"] },
  {
    urls: [
      "turn:turn.cloudflare.com:3478?transport=udp",
      "turn:turn.cloudflare.com:3478?transport=tcp",
      "turns:turn.cloudflare.com:5349?transport=tcp",
      "turn:turn.cloudflare.com:443?transport=udp",
      "turn:turn.cloudflare.com:80?transport=tcp",
      "turns:turn.cloudflare.com:443?transport=tcp",
    ],
    username: "u",
    credential: "c",
  },
];

test("the TLS relay: only turns on 443, with its credentials", () => {
  assert.deepEqual(tlsRelay(cloudflare), [
    { urls: ["turns:turn.cloudflare.com:443?transport=tcp"], username: "u", credential: "c" },
  ]);
});

test("the TLS relay: none when there's no turns on 443 (or no servers at all)", () => {
  assert.deepEqual(tlsRelay([{ urls: "turn:turn.cloudflare.com:443?transport=udp" }]), []);
  assert.deepEqual(tlsRelay([{ urls: "turns:turn.cloudflare.com:5349?transport=tcp" }]), []);
  assert.deepEqual(tlsRelay([]), []);
  assert.deepEqual(tlsRelay([{ urls: "turns:relay.example:443" }]), [{ urls: ["turns:relay.example:443"] }]);
});

test("a world line that didn't open: tried again like a call, the direct way first, then the relay once", () => {
  assert.deepEqual(afterFailedOpen(0, true), { next: "retry", waitMs: 1500 });
  assert.deepEqual(afterFailedOpen(1, true), { next: "retry", waitMs: 3000 });
  assert.deepEqual(afterFailedOpen(WORLD_TRIES - 1, true), { next: "tls" });
  // (over the relay already, or no relay to go to: given up on)
  assert.deepEqual(afterFailedOpen(WORLD_TRIES - 1, false), { next: "stop" });
  assert.deepEqual(afterFailedOpen(WORLD_TRIES, false), { next: "stop" });
});
