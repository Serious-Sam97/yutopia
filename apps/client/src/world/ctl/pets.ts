import { byteFace, isToyHeld, type ServerMessages, THROWN } from "@yutopia/shared";
import type { BattleEvent, PetLook, PetOutfit, Species } from "@yutopia/shared/pets";
import type { Pet, PetBattle } from "@yutopia/state";
import { tr } from "@/lib/i18n";
import { loadPets, pets as petsArt } from "../art/pets-load";
import type { WorldController } from "../controller";
import { fanfare, socialSound } from "../foley";
import type { AvatarState } from "../model";
import type { PetView } from "../petview";
import { type BattleView, hud, type PetInfo, toast } from "../store";
import { petNeeds, safeParse, VORTEX_LOOK } from "./common";

/** What Pets reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type PetsHost = Pick<
  WorldController,
  "actions" | "battleSeen" | "me" | "model" | "petHurt" | "room" | "send" | "toyPick" | "walkTo" | "whereIs"
>;

export class Pets {
  constructor(private readonly c: PetsHost) {}

  // ── pets ─────────────────────────────────────────────────────────────────
  petState(pet: Pet): AvatarState {
    const view: PetView = {
      id: pet.id,
      species: pet.species as Species,
      look: petLook(pet),
      outfit: petOutfit(pet),
      mode: pet.mode,
      act: pet.act,
      actAt: pet.actAt,
      feeling: petsArt()?.feelingOf(petNeeds(pet)) ?? "ok",
      level: pet.level,
      mine: pet.sid === this.c.room?.sessionId,
      hurtAt: this.c.petHurt.get(pet.id),
      lookAt: this.c.whereIs(pet.sid),
      carry: pet.carry || null,
      mood: pet.mood || undefined,
    };
    return {
      // (its owner away: whose it is on its tag — "Rex · Ana's")
      name: pet.sid ? pet.name : `${pet.name} · ${String(pet.owner).split(" ")[0]}'s`,
      avatar: VORTEX_LOOK,
      x: pet.x,
      y: pet.y,
      z: pet.z || undefined, // (in a lift's car: its height)
      yaw: byteFace(pet.yaw),
      a: pet.a,
      status: "online",
      speaking: false,
      emote: pet.want && Date.now() - pet.wantAt < WANT_MS ? pet.want : "", // what it wants, over its head
      mic: false,
      pet: view,
    };
  }

  // My pets not at my heels (exploring, staying put, waiting where I left them): "Call my pets" brings them.
  petsAway(): string[] {
    const room = this.c.room;
    const out: string[] = [];
    room?.state.pets.forEach((pet) => {
      if (
        pet.sid === room.sessionId &&
        pet.alive &&
        !pet.battle &&
        (pet.mode === "explore" || pet.mode === "stay" || pet.mode === "wait")
      )
        out.push(pet.id);
    });
    return out;
  }

  // The pets in the room and the battle I'm in, for the panel and the menus.
  petsKey = "";

  publishPets() {
    const room = this.c.room;
    if (!room) return;
    const mySid = room.sessionId;
    const pets: PetInfo[] = [];
    room.state.pets.forEach((pet) => {
      pets.push({
        id: pet.id,
        uid: pet.uid,
        owner: pet.owner,
        mine: pet.sid === mySid,
        name: pet.name,
        species: pet.species as Species,
        look: petLook(pet),
        outfit: petOutfit(pet),
        needs: petNeeds(pet),
        xp: pet.xp,
        level: pet.level,
        tricks: safeParse(pet.tricks) as Record<string, number>,
        alive: pet.alive,
        wins: pet.wins,
        losses: pet.losses,
        mode: pet.mode,
        act: pet.act,
        battle: pet.battle,
        near: Math.hypot(pet.x - this.c.me.x, pet.y - this.c.me.y) <= 2.8,
        want: pet.want,
        traits: safeParse(pet.traits) as PetInfo["traits"],
        bonds: safeParse(pet.bonds) as PetInfo["bonds"],
      });
    });
    pets.sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name));
    let battle: BattleView | null = null;
    room.state.battles.forEach((b) => {
      const mine = b.sidA === mySid ? "a" : b.sidB === mySid ? "b" : null;
      if (b.phase === "offer" || (!mine && battle)) return;
      if (mine || !battle)
        battle = {
          id: b.id,
          a: b.a,
          b: b.b,
          mine,
          hpA: b.hpA,
          hpB: b.hpB,
          maxA: b.maxA,
          maxB: b.maxB,
          moveA: b.moveA,
          moveB: b.moveB,
          round: b.round,
          phase: b.phase,
          until: b.until,
          log: safeParseList(b.log) as BattleEvent[],
          winner: b.winner,
        };
    });
    const key = JSON.stringify([pets, battle]);
    if (key === this.petsKey) return;
    this.petsKey = key;
    hud.set({ pets, battle });
  }

  // A round played out: who got hit flashes, and the sounds of it.
  watchBattle(b: PetBattle) {
    const key = `${b.id}|${b.round}|${b.phase}`;
    if (this.c.battleSeen === key) return;
    this.c.battleSeen = key;
    if (b.phase !== "anim") return this.publishPets();
    const log = safeParseList(b.log) as BattleEvent[];
    let at = 0;
    for (const ev of log) {
      if (!ev.dmg) continue;
      const hit = ev.who === "a" ? b.b : b.a;
      at += 350;
      setTimeout(() => {
        this.c.petHurt.set(hit, performance.now());
        const pet = this.c.room?.state.pets.get(hit);
        if (pet) {
          const d = Math.hypot(pet.x - this.c.me.x, pet.y - this.c.me.y);
          this.c.model?.puff(pet.x, pet.y, "spark", 1.02);
          socialSound("fistbump", Math.max(0, 1 - d / 10));
        }
      }, at);
    }
    this.publishPets();
  }

  petEvent(m: ServerMessages["pet:event"]) {
    if (!petsArt()) return void loadPets().then(() => this.petEvent(m)); // (its strings come with the chunk)
    const pet = this.c.room?.state.pets.get(m.id);
    const name = pet?.name ?? "";
    const trick = m.trick ? tr(`trick_${m.trick}` as never) : "";
    const text = tr(`petEv_${m.kind}` as never)
      .replace("{name}", name)
      .replace("{n}", String(m.n ?? ""))
      .replace("{trick}", trick);
    if (!text) return;
    if (m.kind === "levelUp" || m.kind === "learned" || m.kind === "won") fanfare(0.6);
    toast(text, m.kind === "died" ? "warn" : "info");
  }

  // A toy in my hand thrown where I click (or the laser pointed there): true when it was.
  throwAt(x: number, y: number, mods: boolean): boolean {
    const me = this.c.room?.state.players.get(this.c.room.sessionId);
    const held = me?.held;
    if (!held || !isToyHeld(held)) return false;
    const armed = hud.get().throwArm;
    if (!armed && !mods) return false;
    if (armed) hud.set({ throwArm: false });
    if ((THROWN as readonly string[]).includes(held)) this.c.send("toy:throw", { x, y });
    else if (held === "laser") this.c.send("laser:point", { x, y });
    else return false;
    this.c.actions.clear();
    return true;
  }

  armThrow(on = true) {
    hud.set({ throwArm: on });
  }

  // A toy on the floor clicked: picked up (walking over first)
  pickToy(id: string) {
    const t = this.c.room?.state.toys.get(id);
    if (!t || t.state !== "floor") return;
    if (Math.hypot(t.x - this.c.me.x, t.y - this.c.me.y) < 1.6) return this.c.send("toy:pick", { id });
    this.c.actions.clear();
    this.c.toyPick = id;
    this.c.walkTo({ x: t.x, y: t.y });
  }

  // Take a toy into my hand (from the Pets panel; the toy box hands them out too)
  takeToy(toy: string) {
    this.c.send("toy:take", { toy: toy as never });
  }

  // Answering a battle proposed to me, and my move each round.
  answerChallenge(accept: boolean) {
    const c = hud.get().challenge;
    if (!c) return;
    hud.set({ challenge: null });
    this.c.send("pet:answer", { battle: c.battle, accept });
  }

  battleMove(move: string) {
    const b = hud.get().battle;
    if (!b || !b.mine) return;
    this.c.send("pet:move", { battle: b.id, move: move as never });
  }
}

const WANT_MS = 6000; // how long what a pet wants shows over its head

const petLook = (pet: Pet): PetLook =>
  ({ color: "#c68a5e", mark: "none", markColor: "#efe4cc", breed: "", ...safeParse(pet.look) }) as PetLook;

const petOutfit = (pet: Pet): PetOutfit =>
  ({
    hat: "none",
    hatColor: "#c4402b",
    collar: "none",
    collarColor: "#c4402b",
    coat: "none",
    coatColor: "#6e7b3a",
    ...safeParse(pet.outfit),
  }) as PetOutfit;

function safeParseList(s: string): unknown[] {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
