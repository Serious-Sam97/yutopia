// Jolt (JoltPhysics.js 1.1.1, the wasm-compat build) behind the bench's engine interface.
// A player: a CharacterVirtual with a capsule (r 0.3, 1.8 tall, feet at its position), moved by
// ExtendedUpdate (steps up to 0.35, slopes to 45°, stuck to the floor walking). Players don't
// collide with each other (no character-vs-character), as now. Static: layer 0; players: 1.
import initJolt from "jolt-physics/wasm-compat";
import { byChunk } from "./chunks.mjs";

export function joltEngine() {
  let J;
  let jolt;
  let system;
  let bodyI;
  const chars = [];
  let walkSettings;
  let airSettings;
  let bpFilter;
  let objFilter;
  let bodyFilter;
  let shapeFilter;
  let alloc;
  let zero;
  let vel;
  let charSettings;
  const dyn = [];
  let narrow;
  const spheres = new Map();
  return {
    name: "jolt",
    async init() {
      J = await initJolt();
      const settings = new J.JoltSettings();
      // (fixed up front: the temp allocator's need grows with them, and running out aborts the
      // whole process — round 1's unchunked 162k boxes needed 400k; chunked, 20k is plenty)
      settings.mMaxBodies = 20000;
      settings.mMaxBodyPairs = 16384;
      settings.mMaxContactConstraints = 16384;
      const objectFilter = new J.ObjectLayerPairFilterTable(2);
      objectFilter.EnableCollision(0, 1);
      objectFilter.EnableCollision(1, 1);
      const bpInterface = new J.BroadPhaseLayerInterfaceTable(2, 2);
      bpInterface.MapObjectToBroadPhaseLayer(0, new J.BroadPhaseLayer(0));
      bpInterface.MapObjectToBroadPhaseLayer(1, new J.BroadPhaseLayer(1));
      settings.mObjectLayerPairFilter = objectFilter;
      settings.mBroadPhaseLayerInterface = bpInterface;
      settings.mObjectVsBroadPhaseLayerFilter = new J.ObjectVsBroadPhaseLayerFilterTable(
        bpInterface,
        2,
        objectFilter,
        2,
      );
      jolt = new J.JoltInterface(settings);
      J.destroy(settings);
      system = jolt.GetPhysicsSystem();
      bodyI = system.GetBodyInterface();
      bpFilter = new J.DefaultBroadPhaseLayerFilter(jolt.GetObjectVsBroadPhaseLayerFilter(), 1);
      objFilter = new J.DefaultObjectLayerFilter(jolt.GetObjectLayerPairFilter(), 1);
      bodyFilter = new J.BodyFilter();
      shapeFilter = new J.ShapeFilter();
      alloc = jolt.GetTempAllocator();
      zero = new J.Vec3(0, 0, 0);
      vel = new J.Vec3(0, 0, 0);
      walkSettings = new J.ExtendedUpdateSettings();
      walkSettings.mWalkStairsStepUp = new J.Vec3(0, 0.35, 0);
      walkSettings.mStickToFloorStepDown = new J.Vec3(0, -0.5, 0);
      airSettings = new J.ExtendedUpdateSettings();
      airSettings.mWalkStairsStepUp = new J.Vec3(0, 0.35, 0);
      airSettings.mStickToFloorStepDown = new J.Vec3(0, 0, 0);
      charSettings = new J.CharacterVirtualSettings();
      charSettings.mMaxSlopeAngle = (45 * Math.PI) / 180;
      charSettings.mShape = new J.RotatedTranslatedShapeSettings(
        new J.Vec3(0, 0.9, 0),
        J.Quat.prototype.sIdentity(),
        new J.CapsuleShapeSettings(0.6, 0.3),
      )
        .Create()
        .Get();
      charSettings.mSupportingVolume = new J.Plane(J.Vec3.prototype.sAxisY(), -0.3);
      charSettings.mCharacterPadding = 0.02;
    },
    build(s, chunk) {
      // the land: Jolt's heightfield is square, its side a multiple of the block size (4): padded
      // with the edge's heights
      const n = Math.ceil((Math.max(s.w, s.d) + 1) / 4) * 4;
      const hs = new J.HeightFieldShapeSettings();
      hs.mOffset = new J.Vec3(s.x0, 0, s.z0);
      hs.mScale = new J.Vec3(1, 1, 1);
      hs.mSampleCount = n;
      hs.mBlockSize = 4;
      hs.mHeightSamples.resize(n * n);
      const samples = new Float32Array(J.HEAPF32.buffer, J.getPointer(hs.mHeightSamples.data()), n * n);
      for (let iz = 0; iz < n; iz++)
        for (let ix = 0; ix < n; ix++)
          samples[iz * n + ix] = s.heights[Math.min(iz, s.d) * (s.w + 1) + Math.min(ix, s.w)];
      const land = hs.Create().Get();
      const add = (shape, x, y, z) => {
        const pos = new J.RVec3(x, y, z);
        const bcs = new J.BodyCreationSettings(shape, pos, J.Quat.prototype.sIdentity(), J.EMotionType_Static, 0);
        const body = bodyI.CreateBody(bcs);
        bodyI.AddBody(body.GetID(), J.EActivation_DontActivate);
        J.destroy(bcs);
        J.destroy(pos);
      };
      add(land, 0, 0, 0);
      const b = s.boxes;
      const he = new J.Vec3(0, 0, 0);
      if (chunk) {
        const at = new J.Vec3(0, 0, 0);
        const id = J.Quat.prototype.sIdentity();
        for (const g of byChunk(b, chunk)) {
          const cs = new J.StaticCompoundShapeSettings();
          for (const k of g.list) {
            const hy = (b[k + 5] - b[k + 4]) / 2;
            he.Set(b[k + 2], hy, b[k + 3]);
            at.Set(b[k] - g.cx, b[k + 4] + hy, b[k + 1] - g.cz);
            cs.AddShape(at, id, new J.BoxShapeSettings(he, 0.05), 0);
          }
          add(cs.Create().Get(), g.cx, 0, g.cz);
          J.destroy(cs);
        }
        system.OptimizeBroadPhase();
        return;
      }
      for (let k = 0; k < b.length; k += 6) {
        const hy = (b[k + 5] - b[k + 4]) / 2;
        he.Set(b[k + 2], hy, b[k + 3]);
        add(new J.BoxShape(he, 0.05, null), b[k], b[k + 4] + hy, b[k + 1]);
      }
      system.OptimizeBroadPhase();
    },
    addPlayer(x, y, z) {
      const pos = new J.RVec3(x, y, z);
      const ch = new J.CharacterVirtual(charSettings, pos, J.Quat.prototype.sIdentity(), system);
      J.destroy(pos);
      chars.push(ch);
      return chars.length - 1;
    },
    move(id, dx, dy, dz, snap) {
      const ch = chars[id];
      vel.Set(dx / (1 / 60), dy / (1 / 60), dz / (1 / 60));
      ch.SetLinearVelocity(vel);
      ch.ExtendedUpdate(
        1 / 60,
        zero,
        snap ? walkSettings : airSettings,
        bpFilter,
        objFilter,
        bodyFilter,
        shapeFilter,
        alloc,
      );
      return ch.GetGroundState() === J.EGroundState_OnGround;
    },
    position(id, out) {
      const p = chars[id].GetPosition();
      out[0] = p.GetX();
      out[1] = p.GetY();
      out[2] = p.GetZ();
    },
    step() {
      jolt.Step(1 / 60, 1);
    },
    raycastDown(x, z) {
      const ray = new J.RRayCast(new J.RVec3(x, 500, z), new J.Vec3(0, -1000, 0));
      const settings = new J.RayCastSettings();
      const col = new J.CastRayClosestHitCollisionCollector();
      system.GetNarrowPhaseQuery().CastRay(ray, settings, col, bpFilter, objFilter, bodyFilter, shapeFilter);
      const y = col.HadHit() ? 500 - col.get_mHit().mFraction * 1000 : null;
      J.destroy(ray);
      J.destroy(settings);
      J.destroy(col);
      return y;
    },
    memory: () => J.JoltInterface.prototype.sGetTotalMemory() - J.JoltInterface.prototype.sGetFreeMemory(),
    // ── round 2: a flat test ground, statics at any angle, players placed and removed, queries,
    // things that fall ──
    buildFlat() {
      const pos = new J.RVec3(0, -0.5, 0);
      const bcs = new J.BodyCreationSettings(
        new J.BoxShape(new J.Vec3(150, 0.5, 150), 0.05, null),
        pos,
        J.Quat.prototype.sIdentity(),
        J.EMotionType_Static,
        0,
      );
      bodyI.AddBody(bodyI.CreateBody(bcs).GetID(), J.EActivation_DontActivate);
      J.destroy(bcs);
      J.destroy(pos);
    },
    addStatic(x, y, z, hx, hy, hz, q) {
      const pos = new J.RVec3(x, y, z);
      const rot = q ? new J.Quat(q.x, q.y, q.z, q.w) : J.Quat.prototype.sIdentity();
      const bcs = new J.BodyCreationSettings(
        new J.BoxShape(new J.Vec3(hx, hy, hz), 0.05, null),
        pos,
        rot,
        J.EMotionType_Static,
        0,
      );
      bodyI.AddBody(bodyI.CreateBody(bcs).GetID(), J.EActivation_DontActivate);
      J.destroy(bcs);
      J.destroy(pos);
    },
    place(id, x, y, z) {
      const pos = new J.RVec3(x, y, z);
      chars[id].SetPosition(pos);
      J.destroy(pos);
    },
    removePlayer(id) {
      J.destroy(chars[id]);
      chars[id] = null;
    },
    ray(ox, oy, oz, dx, dy, dz, max) {
      const o = new J.RVec3(ox, oy, oz);
      const d = new J.Vec3(dx * max, dy * max, dz * max);
      const ray = new J.RRayCast(o, d);
      const settings = new J.RayCastSettings();
      const col = new J.CastRayClosestHitCollisionCollector();
      system.GetNarrowPhaseQuery().CastRay(ray, settings, col, bpFilter, objFilter, bodyFilter, shapeFilter);
      const hit = col.HadHit() ? 1 : 0;
      for (const x of [o, d, ray, settings, col]) J.destroy(x);
      return hit;
    },
    overlap(x, y, z, r) {
      narrow ??= system.GetNarrowPhaseQuery();
      let shape = spheres.get(r);
      if (!shape) {
        shape = new J.SphereShape(r, null);
        spheres.set(r, shape);
      }
      const p = new J.RVec3(x, y, z);
      const m = J.RMat44.prototype.sTranslation(p);
      const settings = new J.CollideShapeSettings();
      const base = new J.RVec3(0, 0, 0);
      const one = new J.Vec3(1, 1, 1);
      const col = new J.CollideShapeAllHitCollisionCollector();
      narrow.CollideShape(shape, one, m, settings, base, col, bpFilter, objFilter, bodyFilter, shapeFilter);
      const n = col.mHits.size();
      for (const o of [p, settings, base, one, col]) J.destroy(o);
      return n;
    },
    addBall(x, y, z, r) {
      const pos = new J.RVec3(x, y, z);
      const bcs = new J.BodyCreationSettings(
        new J.SphereShape(r, null),
        pos,
        J.Quat.prototype.sIdentity(),
        J.EMotionType_Dynamic,
        1,
      );
      bcs.mRestitution = 0.3;
      if (globalThis.CCD === true) bcs.mMotionQuality = J.EMotionQuality_LinearCast;
      const b = bodyI.CreateBody(bcs);
      bodyI.AddBody(b.GetID(), J.EActivation_Activate);
      dyn.push(b.GetID());
      J.destroy(bcs);
      J.destroy(pos);
    },
    addCrate(x, y, z, h) {
      const pos = new J.RVec3(x, y, z);
      const bcs = new J.BodyCreationSettings(
        new J.BoxShape(new J.Vec3(h, h, h), 0.05, null),
        pos,
        J.Quat.prototype.sIdentity(),
        J.EMotionType_Dynamic,
        1,
      );
      if (globalThis.CCD === true) bcs.mMotionQuality = J.EMotionQuality_LinearCast;
      const b = bodyI.CreateBody(bcs);
      bodyI.AddBody(b.GetID(), J.EActivation_Activate);
      dyn.push(b.GetID());
      J.destroy(bcs);
      J.destroy(pos);
    },
    dynState(out) {
      let asleep = 0;
      dyn.forEach((id, i) => {
        const t = bodyI.GetPosition(id);
        out[i * 3] = t.GetX();
        out[i * 3 + 1] = t.GetY();
        out[i * 3 + 2] = t.GetZ();
        if (!bodyI.IsActive(id)) asleep++;
      });
      return asleep;
    },
  };
}
