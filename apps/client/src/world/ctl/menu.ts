import {
  entry,
  face8,
  hangSpot,
  inLift,
  isHeld,
  liftFront,
  liftHere,
  mayLockDoor,
  objectActions,
  placedFootprint,
  reachOf,
  SOCIAL,
  socialFor,
} from "@yutopia/shared";
import { COMPUTER_REACH, computerAway, isComputer } from "@yutopia/shared/computer";
import { isConsole, isGameTv } from "@yutopia/shared/games";
import { radioOf } from "@yutopia/shared/media";
import type { Species } from "@yutopia/shared/pets";
import { tr } from "@/lib/i18n";
import { pets as petsArt } from "../art/pets-load";
import { mixer } from "../audio";
import type { WorldController } from "../controller";
import { machineSound } from "../foley";
import { type ActTarget, hud, toast } from "../store";
import { INTERACT_RANGE, petNeeds, safeParse } from "./common";

/** What ActionMenu reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type ActionMenuHost = Pick<
  WorldController,
  | "actions"
  | "arrival"
  | "focus"
  | "grid"
  | "map"
  | "me"
  | "model"
  | "myUid"
  | "onOpenPanel"
  | "pets"
  | "room"
  | "send"
  | "tableGames"
  | "uidToSid"
  | "usingUntil"
  | "usingWhat"
  | "walkTo"
>;

export class ActionMenu {
  constructor(private readonly c: ActionMenuHost) {}

  // What can be done with it, with a title (and a line about it): null when
  // there's nothing to do.
  menuFor(target: ActTarget): { title: string; subtitle?: string; items: { act: string; ok: boolean }[] } | null {
    const room = this.c.room;
    const me = room?.state.players.get(room.sessionId);
    if (!room || !me) return null;
    if (target.type === "self") {
      const items = [{ act: "look", ok: true }];
      if (me.held) items.push({ act: "putDown", ok: true });
      if (me.focus) items.push({ act: "unfocus", ok: true });
      items.push({ act: "arriveHere", ok: true });
      if (hud.get().mySpawn) items.push({ act: "arriveUsual", ok: true });
      // a pet off exploring (or told to stay) somewhere: called back from here
      if (this.c.pets.petsAway().length) items.push({ act: "callPets", ok: true });
      return { title: me.name, items };
    }
    if (target.type === "pet") {
      const pet = room.state.pets.get(target.id);
      const P = petsArt();
      if (!pet || !pet.alive || !P) return null;
      const mine = pet.sid === room.sessionId;
      const items: { act: string; ok: boolean }[] = [{ act: "petpet", ok: !pet.battle }];
      const sp = pet.species as Species;
      if (mine) {
        const free = !pet.battle;
        items.push({ act: "snack", ok: free }, { act: "water", ok: free }, { act: "speak", ok: free });
        const far = Math.hypot(pet.x - me.x, pet.y - me.y) > 3;
        if (far) items.push({ act: "come", ok: free });
        if (pet.mode !== "follow") items.push({ act: "followMe", ok: free });
        if (pet.mode !== "explore") items.push({ act: "explore", ok: free });
        if (pet.mode !== "stay") items.push({ act: "stay", ok: free });
        if (pet.mode !== "sleep") items.push({ act: "sleep", ok: free });
        const t = safeParse(pet.tricks) as Record<string, number>;
        const known = P.tricksFor(sp).filter((x) => P.learned(t, x));
        if (known.length) items.push({ act: `trick_${known[0]}`, ok: free });
        items.push({ act: "petCare", ok: true });
      } else {
        const myFree =
          [...room.state.players.values()].length > 0 && hud.get().pets.some((x) => x.mine && x.alive && !x.battle);
        // its owner away (docs/plan/51-the-pet.md): anyone may feed and water it
        if (!pet.sid) items.push({ act: "snack", ok: !pet.battle }, { act: "water", ok: !pet.battle });
        items.push({ act: "challenge", ok: myFree && !pet.battle }, { act: "petCare", ok: true });
      }
      const feeling = tr(`feel_${P.feelingOf(petNeeds(pet))}` as never);
      return { title: pet.name, subtitle: `${tr(`sp_${sp}` as never)} · Lv ${pet.level} · ${feeling}`, items };
    }
    if (target.type === "person") {
      const p = room.state.players.get(target.sid);
      if (!p) return null;
      const can = socialFor({ held: me.held, status: me.status }, { held: p.held, status: p.status });
      const items: { act: string; ok: boolean }[] = SOCIAL.map((act) => ({ act, ok: can.includes(act) }))
        // cheers and give only make sense with drinks about
        .filter((i) => i.ok || (i.act !== "cheers" && i.act !== "give"));
      items.push({ act: "follow", ok: true }, { act: "profile", ok: true });
      return { title: p.name, subtitle: p.focus ? tr("focusing") : undefined, items };
    }
    const o = this.c.model?.getObject(target.id);
    if (!o) return null;
    // someone else's desk: whose (and who they are, when they're here)
    const owner = Number(o.props?.ownerId);
    if (o.kind === "desk" && owner && owner !== this.c.myUid()) {
      if (!this.c.uidToSid.has(owner)) return null;
      return {
        title: `${String(o.props?.ownerName ?? "").split(" ")[0]} · ${entry(o.kind).label}`,
        items: [{ act: "profile", ok: true }],
      };
    }
    const acts = objectActions(o, {
      uid: this.c.myUid(),
      focus: !!me.focus,
      radioOn: radioOf(o).playing,
      mayLock: (d) => mayLockDoor(this.c.map, d, { uid: this.c.myUid(), admin: me.admin }),
    });
    if (!acts.length) return null;
    const e = entry(o.kind);
    const title = o.kind === "tabletop" && o.props?.d === "desklamp" ? tr("deskLamp") : e.label;
    return { title, items: acts.map((act) => ({ act, ok: true })) };
  }

  openMenu(target: ActTarget, at: { x: number; y: number }, chosen = false): boolean {
    const m = this.menuFor(target);
    if (!m) return false;
    mixer.blip("click");
    // (opened on the keys or a pad: the first that can be done chosen, moved with them)
    const sel = chosen
      ? Math.max(
          0,
          m.items.findIndex((i) => i.ok),
        )
      : undefined;
    hud.set({ menu: { x: at.x, y: at.y, target, ...m, sel } });
    return true;
  }

  /** The open menu's choice moved by `by` (round its ring, past what can't be done). */
  menuStep(by: number) {
    const m = hud.get().menu;
    if (!m) return;
    const n = m.items.length;
    let i = m.sel ?? (by > 0 ? -1 : 0);
    for (let k = 0; k < n; k++) {
      i = (i + by + n) % n;
      if (m.items[i].ok) break;
    }
    hud.set({ menu: { ...m, sel: i } });
  }

  menuPick() {
    const m = hud.get().menu;
    const it = m?.items[m.sel ?? -1];
    if (it?.ok) this.pickAction(it.act);
  }

  closeMenu() {
    if (hud.get().menu) hud.set({ menu: null });
  }

  // Picked from the menu: queued (walk there, then do it).
  pickAction(act: string) {
    const m = hud.get().menu;
    if (!m) return;
    hud.set({ menu: null });
    this.doAct(act, m.target, m.title);
  }

  /** An action on a target: a menu's pick, or Use tapped on the focus (docs/plan/56 C). */
  doAct(act: string, target: ActTarget, title: string) {
    const m = { target, title };
    // looking things up happens at once (no need to walk over)
    const t = m.target;
    const desk = t.type === "object" ? this.c.model?.getObject(t.id) : undefined;
    const owner = Number(desk?.props?.ownerId);
    if (act === "profile" && desk) return hud.set({ inspect: owner });
    if (act === "profile" && t.type === "person") {
      const p = this.c.room?.state.players.get(t.sid);
      if (p) hud.set({ inspect: p.uid });
      return;
    }
    if (act === "look") return hud.set({ panel: { kind: "avatar" } });
    // a pet's commands need no walking over; care, toys and lessons do
    if (t.type === "pet") {
      const id = t.id;
      if (act === "petCare") return hud.set({ panel: { kind: "pets" }, petFocus: id });
      const cmd = act === "followMe" ? "follow" : act;
      if (
        cmd === "come" ||
        cmd === "stay" ||
        cmd === "follow" ||
        cmd === "explore" ||
        cmd === "sleep" ||
        cmd === "speak"
      )
        return this.c.send("pet:cmd", { id, cmd });
      const tk = act.slice(6);
      if (act.startsWith("trick_") && petsArt()?.isTrick(tk))
        return this.c.send("pet:cmd", { id, cmd: "trick", trick: tk as never });
    }
    if (act === "arriveHere") return this.c.arrival.setArrival({ x: this.c.me.x, y: this.c.me.y });
    if (act === "arriveUsual") return this.c.arrival.setArrival(null);
    if (act === "callPets") {
      for (const id of this.c.pets.petsAway()) this.c.send("pet:cmd", { id, cmd: "follow" });
      return;
    }
    this.c.actions.add(act, m.target, m.title);
  }

  activateObject(id: string, walkIfFar: boolean) {
    const o = this.c.model?.getObject(id);
    if (!o || this.c.focus.offBand(o) > 0) return;
    const e = entry(o.kind);
    if (!e.interact) return;
    const { w, h } = placedFootprint(o);
    // an elevator (shared lift.ts): its doors open here, a click takes me in;
    // shut, I call it to my floor (from in front of its doors). In it, its
    // panel does the rest.
    if (e.interact === "lift") {
      if (inLift(o, this.c.me)) return;
      if (o.props?.door === "open" && liftHere(o, this.c.map)) {
        if (walkIfFar) this.c.walkTo({ x: o.x + w / 2, y: o.y + h / 2 });
        return;
      }
      const front = liftFront(o);
      if (Math.hypot(front.x - this.c.me.x, front.y - this.c.me.y) > 2) {
        const to = walkIfFar ? this.c.grid.nearestOpen(front.x, front.y, 3) : null;
        if (to) this.c.walkTo(to, id);
        return;
      }
      mixer.blip("click");
      this.c.send("lift:call", { id });
      if (o.props?.door !== "open") toast(tr("liftCalled"));
      return;
    }
    // a computer: sit down at its desk (the seat nearest me), else stand in front of it
    if (isComputer(o.kind) && computerAway(o, this.c.me) > COMPUTER_REACH - 0.15) {
      if (!walkIfFar) return;
      let seat: { x: number; y: number } | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (let y = o.y - 1; y <= o.y + 1; y++)
        for (let x = o.x - 1; x <= o.x + 1; x++) {
          if (!this.c.grid.seatAt(x + 0.5, y + 0.5)) continue;
          const d = Math.hypot(x + 0.5 - this.c.me.x, y + 0.5 - this.c.me.y);
          if (d < best) {
            best = d;
            seat = { x: x + 0.5, y: y + 0.5 };
          }
        }
      const to =
        seat ?? this.c.grid.nearestOpen(o.x + 0.5, o.y - 0.5, 3) ?? this.c.grid.nearestOpen(o.x + 0.5, o.y + 1.5, 3);
      if (to) this.c.walkTo(to, id);
      return;
    }
    if (!isComputer(o.kind) && reachOf(o, this.c.me) > INTERACT_RANGE + 0.3) {
      if (!walkIfFar) return;
      // walk to the nearest open tile in front of it (a wall item: its side of the wall), then open
      const spot = e.wall ? hangSpot(o, 0.7) : null;
      const front = spot
        ? this.c.grid.nearestOpen(spot.x, spot.y, 4)
        : (this.c.grid.nearestOpen(o.x + w / 2, o.y + h + 0.5, 4) ??
          this.c.grid.nearestOpen(o.x + w / 2, o.y + h / 2, 4));
      if (front) this.c.walkTo(front, id);
      return;
    }
    // turn to face it
    const ox = o.x + w / 2;
    const oy = o.y + h / 2;
    if (Math.hypot(ox - this.c.me.x, oy - this.c.me.y) > 0.2)
      this.c.me.yaw = face8(ox - this.c.me.x, oy - this.c.me.y, this.c.me.yaw);
    // a console's cable in hand: into this TV (the server says if it reaches)
    const cable = hud.get().cable;
    if (cable) {
      if (isGameTv(o.kind)) this.c.send("game:plug", { id: cable.consoleId, tv: id });
      else toast(tr("cableNotHere"), "warn");
      return;
    }
    if (
      e.interact === "coffee" ||
      e.interact === "water" ||
      e.interact === "vending" ||
      e.interact === "cocoa" ||
      e.interact === "tea" ||
      e.interact === "icecream"
    ) {
      // the machine does its thing (a moment, its sound), then hands you a
      // drink, sipped little by little (shared/held.ts)
      if (performance.now() < this.c.usingUntil) return;
      const how = {
        coffee: ["brew", 1600, "coffeeMade"],
        // (as long as the body takes at it: chars/anim/acts.ts MACHINE_S, plan 62)
        water: ["pour", 1400, "waterPoured"],
        vending: ["clunk", 1500, "sodaBought"],
        cocoa: ["pour", 1600, "cocoaPoured"],
        tea: ["pour", 1600, "teaMade"],
        icecream: ["clunk", 1400, "iceCreamScooped"],
      } as const;
      const [snd, ms, msg] = how[e.interact];
      this.c.usingWhat = e.interact;
      this.c.usingUntil = performance.now() + ms;
      machineSound(snd);
      setTimeout(() => {
        this.c.send("item:take", { id });
        toast(tr(msg));
      }, ms);
      return;
    }
    // a chess table (plan 70): to a free chair and sat in it, playing on the board itself — or watching
    if (e.interact === "chess") {
      if (this.c.tableGames.chess) this.c.tableGames.chess.use(id);
      else {
        this.c.tableGames.chessChanged();
        void this.c.tableGames.chessLoading?.then(() => this.c.tableGames.chess?.use(id));
      }
      return;
    }
    if (e.interact === "piano") {
      this.c.onOpenPanel("piano", id);
      return;
    }
    // (plan 68) a present: opened if it's mine (the server says); a wrapping table: who it's for
    if (e.interact === "present") {
      this.c.send("present:open", { id });
      return;
    }
    if (e.interact === "wrap") {
      const held = hud.get().held?.kind;
      if (!isHeld(held)) toast(tr("wrapHoldFirst"), "warn");
      else hud.set({ wrap: { id } });
      return;
    }
    if (e.interact === "lamp") {
      mixer.blip("click");
      this.c.send("lamp:set", { id, on: o.props?.on === false });
      return;
    }
    // (no panel for a switch: one opened anyway would swallow the keys)
    if (e.interact === "switch") {
      mixer.blip("click");
      this.c.send("lights:room", { id, on: o.props?.on === false });
      return;
    }
    if (e.interact === "terminal") this.c.send("vortex:poke", {});
    // a computer: the server says if it's mine (computer:ok opens its panel)
    if (e.interact === "computer") {
      this.c.send("computer:use", { id });
      return;
    }
    // a pet's bowl: fill it; the toy box: the Pets cabinet's Play deck (no panel of their own)
    if (e.interact === "petbowl" || e.interact === "waterbowl") {
      mixer.blip("click");
      this.c.send("pet:bowl", { id });
      return;
    }
    if (e.interact === "toybox") {
      this.c.onOpenPanel("pets", id);
      return;
    }
    // a media TV with a console plugged in: the TV's own panel (its inputs, the remote among them)
    const plugged =
      e.interact === "media" &&
      isGameTv(o.kind) &&
      !!this.c.model?.allObjects().some((x) => isConsole(x.kind) && x.props?.tv === id);
    this.c.onOpenPanel(plugged ? "tv" : e.interact, id);
  }
}
