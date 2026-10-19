"use client";

import { SECRET_NUMBERS } from "@yutopia/shared/phone";
import { useEffect, useState } from "react";
import { useTr } from "@/lib/i18n";
import { dtmf } from "@/world/phone/sounds";
import type { Contact } from "@/world/phone/store";
import { usePhone } from "@/world/phone/store";
import { useWorld } from "../../ctx";
import s from "../phone.module.css";
import { cx, Head, Ic, PFace, secs, VxFace, Wallpaper, when } from "../ui";

// Contacts (the people you added by their user id, and where each of them is
// right now), adding someone, one person's card, the Phone app (Recents ·
// Favourites · Keypad) and Vortex's card.

function whereOf(c: Contact, t: ReturnType<typeof useTr>): string {
  if (c.uid === 0) return t("phVortexWhere");
  if (!c.online) return t("phOfflineNow");
  return c.area || "Yutopia";
}

export function Contacts() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const contacts = usePhone((p) => p.contacts);
  const wp = usePhone((p) => p.settings.wallpaper);
  const space = w?.session?.world.name ?? "";
  const [q, setQ] = useState("");
  useEffect(() => {
    void ph?.loadContacts(true);
  }, [ph]);
  if (!ph) return null;
  const match = (c: Contact) => !q || c.name.toLowerCase().includes(q.toLowerCase());
  const here = contacts.filter((c) => c.here && c.online && match(c));
  const rest = contacts.filter((c) => !(c.here && c.online) && c.uid !== 0 && match(c));
  const row = (c: Contact) => (
    <button
      key={c.uid}
      type="button"
      className={s.row}
      data-nav
      onClick={() => ph.go({ app: "contacts", view: "card", arg: String(c.uid) })}
      data-contact={c.uid}
    >
      <PFace
        avatar={ph.avatarOf(c.uid)}
        name={c.name}
        size={34}
        status={c.online ? (c.status === "away" ? "away" : "on") : "off"}
      />
      <div className={s.col}>
        <div className={s.nm}>{c.name}</div>
        <div className={cx(s.sub, c.online && s.subLive)}>{whereOf(c, t)}</div>
      </div>
    </button>
  );
  return (
    <>
      <Wallpaper id={wp} dim />
      <div className={s.content}>
        <Head title={t("app_contacts")} ph={ph}>
          <button
            type="button"
            className={s.act}
            data-nav
            aria-label={t("phAddContact")}
            title={t("phAddContact")}
            onClick={() => ph.go({ app: "contacts", view: "add" })}
            data-add-contact
          >
            <Ic n="plus" size={15} w={2.2} />
          </button>
        </Head>
        <label className={s.srch}>
          <Ic n="search" size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("phSearchTeam")} data-nav />
        </label>
        <div className={s.scroll}>
          {here.length > 0 && (
            <>
              <div className={s.sec}>{t("phInSpace").replace("{space}", space)}</div>
              <div className={cx(s.list, s.glass)}>{here.map(row)}</div>
            </>
          )}
          {!contacts.length && !q && <p className={s.empty}>{t("phNoContacts")}</p>}
          {here.length > 0 && rest.length > 0 && <div className={s.sec}>{t("phElsewhere")}</div>}
          <div className={cx(s.list, s.glass)} style={here.length && !rest.length ? { marginTop: 8 } : undefined}>
            {rest.map(row)}
            {(!q || "vortex".includes(q.toLowerCase())) && (
              <button type="button" className={s.row} data-nav onClick={() => ph.open("vortex")}>
                <VxFace size={34} />
                <div className={s.col}>
                  <div className={s.nm}>Vortex</div>
                  <div className={s.sub}>{t("phVortexWhere")}</div>
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Add someone by their user id (it's in their phone's Settings)
export function AddContact() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const wp = usePhone((p) => p.settings.wallpaper);
  const [id, setId] = useState("");
  const [found, setFound] = useState<{ uid: number; name: string; avatar: string; added: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!ph) return null;
  const find = async () => {
    const uid = Number(id);
    if (!uid) return;
    setBusy(true);
    setErr("");
    setFound(null);
    try {
      const r = await ph.lookup(uid);
      setFound({ uid: r.person.uid, name: r.person.name, avatar: r.person.avatar, added: r.added });
    } catch {
      setErr(t("phNobody"));
    }
    setBusy(false);
  };
  return (
    <>
      <Wallpaper id={wp} dim />
      <div className={s.content}>
        <Head title={t("phAddContact")} ph={ph} />
        <div className={s.sec}>{t("phAddById")}</div>
        <form
          style={{ display: "flex", gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            void find();
          }}
        >
          <input
            className={s.idIn}
            inputMode="numeric"
            value={id}
            onChange={(e) => setId(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="1234"
            aria-label={t("phAddById")}
            data-nav
            data-contact-id
          />
          <button
            type="submit"
            className={s.act}
            style={{ width: 44, height: 44 }}
            disabled={busy || !id}
            aria-label={t("phFind")}
            data-nav
          >
            <Ic n="search" size={18} />
          </button>
        </form>
        <p className={s.sub} style={{ whiteSpace: "normal", margin: "8px 4px", fontSize: 11.5 }}>
          {t("phAddHint")}
        </p>
        {err && <p className={s.empty}>{err}</p>}
        {found && (
          <div
            className={s.glass}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              padding: 16,
              marginTop: 8,
            }}
          >
            <PFace avatar={found.avatar} name={found.name} size={72} />
            <div className={s.nm} style={{ fontSize: 16 }}>
              {found.name}
            </div>
            <div className={s.sub}>ID {found.uid}</div>
            {found.added ? (
              <span className={s.sub} style={{ color: "var(--cya)" }}>
                {t("phAdded")}
              </span>
            ) : (
              <button
                type="button"
                className={s.get}
                style={{ background: "var(--holo)", padding: "9px 22px" }}
                data-nav
                data-contact-add
                onClick={async () => {
                  if (await ph.addContact(found.uid)) {
                    setFound({ ...found, added: true });
                    setTimeout(() => ph.back(), 700);
                  }
                }}
              >
                {t("phAdd")}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export function ContactCard({ uid }: { uid: number }) {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const c = usePhone((p) => p.contacts.find((x) => x.uid === uid) ?? null);
  const fav = usePhone((p) => p.settings.favourites.includes(uid));
  const tone = usePhone((p) => p.settings.tones[String(uid)]);
  const wp = usePhone((p) => p.settings.wallpaper);
  if (!ph) return null;
  const name = c?.name ?? ph.nameOf(uid);
  const inRoom = w?.personByUid(uid);
  return (
    <>
      <Wallpaper id={wp} dim />
      <div className={s.content}>
        <Head title="" ph={ph}>
          <button
            type="button"
            className={s.round}
            data-nav
            aria-label={fav ? t("phUnfavourite") : t("phFavourite")}
            onClick={() => {
              const f = ph.settingsNow().favourites;
              ph.setSettings({ favourites: fav ? f.filter((u) => u !== uid) : [...f, uid] });
            }}
            style={fav ? { color: "#ffd36b" } : undefined}
          >
            <Ic n="star" size={16} fill={fav} />
          </button>
        </Head>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginTop: 6 }}>
          <PFace avatar={ph.avatarOf(uid)} name={name} size={96} status={c?.online ? "on" : "off"} />
          <div className={s.callNm} style={{ fontSize: 22 }}>
            {name}
          </div>
          <div className={cx(s.sub, c?.online && s.subLive)}>{c ? whereOf(c, t) : ""}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, margin: "18px 0 14px" }}>
          {(
            [
              ["phText", "messages", () => void ph.openThreadWith([uid])],
              ["phCall", "phone", () => ph.calls.start([uid])],
              ["phVideo", "video", () => ph.calls.start([uid], true)],
              ...(inRoom ? ([["phGoTo", "walk", () => w?.teleport({ userId: uid })]] as const) : []),
            ] as const
          ).map(([label, icon, fn]) => (
            <button key={label} type="button" className={s.cbtnWrap} data-nav onClick={fn}>
              <span className={s.cbtn} style={{ width: 48, height: 48 }}>
                <Ic n={icon} size={20} />
              </span>
              {t(label)}
            </button>
          ))}
        </div>
        <div className={cx(s.list, s.glass)}>
          {c ? (
            <button
              type="button"
              className={s.srow}
              data-nav
              onClick={() => {
                void ph.removeContact(uid);
                ph.back();
              }}
            >
              <span className={s.si} style={{ background: "#5a2433" }}>
                <Ic n="trash" />
              </span>
              {t("phRemoveContact")}
            </button>
          ) : (
            <button type="button" className={s.srow} data-nav onClick={() => void ph.addContact(uid)}>
              <span className={s.si} style={{ background: "linear-gradient(150deg,#ff7ac8,#a23cf0)" }}>
                <Ic n="addPerson" />
              </span>
              {t("phAddToContacts")}
            </button>
          )}
          <button
            type="button"
            className={s.srow}
            data-nav
            onClick={() => ph.go({ app: "settings", view: "sounds", arg: `tone:${uid}` })}
          >
            <span className={s.si} style={{ background: "linear-gradient(150deg,#41f3d9,#00766e)" }}>
              <Ic n="music" />
            </span>
            {t("phRingtone")}
            <span className={s.sv}>
              {tone ? t(`tone_${tone}`) : t("phDefaultTone").replace("{tone}", t(`tone_${ph.settingsNow().ringtone}`))}
              <Ic n="chev" size={14} />
            </span>
          </button>
        </div>
      </div>
    </>
  );
}

// ── the Phone app ──────────────────────────────────────────────────────────
export function PhoneApp({ tab }: { tab: string }) {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const [cur, setCur] = useState(tab);
  const wp = usePhone((p) => p.settings.wallpaper);
  if (!ph) return null;
  return (
    <>
      <Wallpaper id={wp} dim />
      <div className={s.content}>
        <Head title={t("app_phone")} ph={ph} />
        <div className={s.seg}>
          {(["recents", "favourites", "keypad"] as const).map((x) => (
            <button key={x} type="button" className={cx(cur === x && s.on)} onClick={() => setCur(x)} data-nav>
              {t(x === "recents" ? "phRecents" : x === "favourites" ? "phFavourites" : "phKeypad")}
            </button>
          ))}
        </div>
        {cur === "recents" && <Recents />}
        {cur === "favourites" && <Favourites />}
        {cur === "keypad" && <Keypad />}
      </div>
    </>
  );
}

function Recents() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const recents = usePhone((p) => p.recents);
  const me = usePhone((p) => p.me.uid);
  useEffect(() => {
    void ph?.loadRecents();
  }, [ph]);
  if (!ph) return null;
  if (!recents.length) return <p className={s.empty}>{t("phNoRecents")}</p>;
  return (
    <div className={s.scroll}>
      <div className={cx(s.list, s.glass)}>
        {recents.map((r) => {
          const missed = r.call.end !== "answered" && r.call.from !== me;
          const who = r.peers;
          const name = who.map((u) => ph.nameOf(u).split(" ")[0]).join(", ");
          return (
            <button
              key={r.id}
              type="button"
              className={s.row}
              data-nav
              onClick={() => ph.calls.start(who, r.call.video)}
            >
              <PFace avatar={ph.avatarOf(who[0] ?? 0)} name={name} size={34} />
              <div className={s.col}>
                <div className={cx(s.nm, missed && s.subMissed)}>{name}</div>
                <div className={s.sub} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <Ic n={r.call.video ? "video" : "phone"} size={11} />
                  {missed
                    ? t(r.call.video ? "phMissedVideo" : "phMissed")
                    : r.call.from === me
                      ? r.call.end === "answered"
                        ? `${t("phOutgoing")} · ${secs(r.call.secs)}`
                        : t("phNoAnswer")
                      : `${t("phIncoming")} · ${secs(r.call.secs)}`}
                </div>
              </div>
              <div className={s.tm}>{when(r.at)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Favourites() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const favs = usePhone((p) => p.settings.favourites);
  const contacts = usePhone((p) => p.contacts);
  if (!ph) return null;
  if (!favs.length) return <p className={s.empty}>{t("phNoFavourites")}</p>;
  return (
    <div className={s.scroll}>
      <div className={cx(s.list, s.glass)}>
        {favs.map((uid) => {
          const c = contacts.find((x) => x.uid === uid);
          return (
            <button key={uid} type="button" className={s.row} data-nav onClick={() => ph.calls.start([uid])}>
              <PFace avatar={ph.avatarOf(uid)} name={ph.nameOf(uid)} size={34} status={c?.online ? "on" : "off"} />
              <div className={s.col}>
                <div className={s.nm}>{ph.nameOf(uid)}</div>
                <div className={s.sub}>{c?.online ? (c.area ?? "") : t("phOfflineNow")}</div>
              </div>
              <span className={s.round}>
                <Ic n="phone" size={15} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const KEYS: [string, string][] = [
  ["1", ""],
  ["2", "ABC"],
  ["3", "DEF"],
  ["4", "GHI"],
  ["5", "JKL"],
  ["6", "MNO"],
  ["7", "PQRS"],
  ["8", "TUV"],
  ["9", "WXYZ"],
  ["*", ""],
  ["0", "+"],
  ["#", ""],
];
function Keypad() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const [n, setN] = useState("");
  useEffect(() => {
    // typing the digits on the keyboard works too
    const on = (e: KeyboardEvent) => {
      if (/^[0-9*#]$/.test(e.key)) {
        dtmf(e.key);
        setN((x) => (x + e.key).slice(0, 14));
      } else if (e.key === "Backspace" && n) {
        e.stopImmediatePropagation();
        setN((x) => x.slice(0, -1));
      }
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [n]);
  if (!ph) return null;
  return (
    <>
      <div className={s.kd}>{n || " "}</div>
      <div className={s.kdHint}>{t("phSecret")}</div>
      <div className={s.keys} data-cols="3">
        {KEYS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            className={s.key}
            data-nav
            onClick={() => {
              dtmf(k);
              setN((x) => (x + k).slice(0, 14));
            }}
          >
            <b>{k}</b>
            <i>{l || " "}</i>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
        <button
          type="button"
          className={cx(s.cbtn, s.green)}
          style={{ animation: "none" }}
          aria-label={t("phCall")}
          data-nav
          onClick={() => {
            const secret = SECRET_NUMBERS[n];
            if (secret) return ph.secretNumber(secret);
            if (n) ph.note(t("phEnd_unreachable"));
          }}
        >
          <Ic n="phone" size={24} />
        </button>
      </div>
    </>
  );
}

// ── Vortex's card ──────────────────────────────────────────────────────────
export function VortexCard() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const wp = usePhone((p) => p.settings.wallpaper);
  if (!ph) return null;
  return (
    <>
      <Wallpaper id="vortex" />
      <div className={s.content}>
        <Head title="" ph={ph} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 4 }}>
          <VxFace size={128} mood="malicious" />
          <div className={cx(s.callNm, s.holoText)} style={{ letterSpacing: ".2em", marginTop: 8 }}>
            VORTEX
          </div>
          <div className={s.sub}>{t("phVortexWhere")}</div>
          <p className={s.empty} style={{ padding: "10px 18px 0" }}>
            {t("phVortexAbout")}
          </p>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: "auto", marginBottom: 30 }}>
          <button type="button" className={s.cbtnWrap} data-nav onClick={() => void ph.openThreadWith([0])}>
            <span className={s.cbtn}>
              <Ic n="messages" size={24} />
            </span>
            {t("phText")}
          </button>
          <button type="button" className={s.cbtnWrap} data-nav onClick={() => ph.calls.start([0])}>
            <span className={cx(s.cbtn, s.green)} style={{ animation: "none" }}>
              <Ic n="phone" size={24} />
            </span>
            {t("phCall")}
          </button>
        </div>
        <span data-wp={wp} hidden />
      </div>
    </>
  );
}
