import assert from "node:assert/strict";
import { test } from "node:test";
import { CAR_COLOURS as SHARED_COLOURS } from "@yutopia/shared";
import { BUYABLE as SHARED_BUYABLE, PLATE_MAX as SHARED_PLATE } from "@yutopia/shared/car";
import { BUYABLE, CAR_COLOURS, PLATE_MAX } from "./cars.ts";

test("the admins' Spawn copy of the vehicles and colours agrees with shared", () => {
  assert.deepEqual(BUYABLE, [...SHARED_BUYABLE]);
  assert.deepEqual(CAR_COLOURS, [...SHARED_COLOURS]);
  assert.equal(PLATE_MAX, SHARED_PLATE);
});
