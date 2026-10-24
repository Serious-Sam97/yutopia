import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// A stall (docs/plan/41-the-snap.md) is logged with what we were doing and whether the
// process was busy or not running at all (stopped by the host: CPU, swap).

const metricsFile = fileURLToPath(new URL("./metrics.ts", import.meta.url));

// a process with the metrics in it; `then` runs inside it once it's going
function child(then: string): { out: () => string; pid: number; done: Promise<void> } {
  let text = "";
  const code = `await import(${JSON.stringify(metricsFile)}); const { metrics } = await import(${JSON.stringify(metricsFile)}); ${then}`;
  const c = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const take = (d: Buffer) => {
    text += d;
  };
  c.stdout.on("data", take);
  c.stderr.on("data", take);
  return { out: () => text, pid: c.pid as number, done: new Promise((r) => c.on("exit", () => r())) };
}

test("busy: our own work holds everything up — logged with its CPU time and the work's name", async () => {
  const c = child(`
    await new Promise((r) => setTimeout(r, 300));
    // (450 ms of CPU — however long the machine takes to give it: other tests may be running)
    const c0 = process.cpuUsage();
    while (process.cpuUsage(c0).user < 450_000) {}
    metrics.tick(450, "cars 450 ms");
    await new Promise((r) => setTimeout(r, 400));
  `);
  await c.done;
  const line =
    c
      .out()
      .split("\n")
      .find((l) => l.startsWith("[stall]")) ?? "";
  assert.match(line, /\[stall\] \d+ ms/);
  assert.match(line, /tick \(cars 450 ms\)/);
  // (its CPU time counted: the stall was our work — "busy", unless the machine was so loaded
  // that it also wasn't running much of the time)
  assert.ok(Number(/CPU (\d+) ms/.exec(line)?.[1]) >= 400, line);
});

test("not running: the process stopped from outside (as by the host) — logged as not running", async () => {
  const c = child("await new Promise((r) => setTimeout(r, 2500));");
  await sleep(700);
  process.kill(c.pid, "SIGSTOP");
  await sleep(600);
  process.kill(c.pid, "SIGCONT");
  await c.done;
  const line =
    c
      .out()
      .split("\n")
      .find((l) => l.startsWith("[stall]")) ?? "";
  assert.match(line, /\[stall\] \d+ ms/, c.out());
  assert.match(line, /not running/);
  assert.match(line, /none timed/);
});
