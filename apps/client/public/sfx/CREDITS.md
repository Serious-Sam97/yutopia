# Sound credits

- `lift/door-open.mp3`, `lift/door-close.mp3` — *Elevator Door* by PagDev,
  https://opengameart.org/content/elevatordoor (CC0). Cut to 1.7 s, levelled,
  mono; the close is the opening reversed.
- `car/*.mp3` — the engine: *The Dyno Sessions: 190E* by Chippy569 (Track
  Time Audio), a Mercedes-Benz 190E-16V on a dynamometer,
  https://freesound.org/people/Chippy569/packs/9658/ (CC0). Loops at about
  1,000 / 2,500 / 6,300 rpm with no load (`*-off-lo|mid|hi`: Freesound
  162515, 162518, 162521 by the exhaust — `ex-` — and 162516, 162519, 162522
  in the engine bay — `bay-`) and at about 1,300 / 2,550 / 6,200 rpm at full
  load (`*-on-lo|mid|hi`: 162506, 162509, 162512 and 162507, 162510,
  162513); `start` is 162528 (23_StartISmall_D6). Cut from the HQ previews,
  levelled to −20 dB RMS each (the game sets their mix), mono 96 kb/s. The
  revs are measured from each loop's firing frequency, not taken from its
  label (the "500" full-load one runs at ~1,290). Their seams are crossfaded
  as they're decoded.
- Everything else (`lift/chime`, `lift/button`, `lift/ride.wav`,
  `stairs/step-1..4`, `stairs/door-open`, `stairs/door-close`) — made for
  Yutopia by `tools/sfx-synth.mjs` (`node tools/sfx-synth.mjs` makes them
  again). A recorded one dropped in under the same name replaces it.
- `steps/*` — the steps (docs/plan/63-the-steps.md), picked by ear on `/dev/steps` 2026-11-01 from
  55 candidates. All CC0: cut into single steps (Freesound's HQ previews, by onset) or trimmed
  (OpenGameArt's, already single steps), levelled to about −22 dB, mono 80 kb/s; black ice plays
  ice's. `wood-*` *Wood Steps* by Phil25 (Freesound 208104); `hollow-*` *Footsteps on hollow wood*
  by florianreichelt (Freesound 459970); `carpet-*` *FootstepsCarpet* by MindlessTrails (Freesound
  509534); `tile-*` *Footsteps on Tiles* by RutgerMuller (Freesound 50725); `concrete-*` *Footsteps
  on concrete* by florianreichelt (Freesound 459964); `rock-*` *Stone Steps* by Phil25 (Freesound
  208103); `asphalt-*` *footsteps shoes walk road asphalt hard* by kyles (Freesound 637556);
  `grate-*` *Walking_and_running_on_a_steel_floor (sound samples)* by SoundsofTheMachine (Freesound
  809440); `sheet-*` *Footsteps On Metal* by IENBA (Freesound 834029); `earth-*`
  *Footsteps_6_Dirt_shoe* by monte32 (Freesound 353799); `felt-*` *FOLEY_Footsteps_Carpet_001* by
  conleec (Freesound 148466); `snow-*` *Footsteps or Walking in Hard Crunchy Snow* by mshahen
  (Freesound 559459); `deep-*` *Snow shoe steps (41, via qubodup)* by Corsica_S (OpenGameArt,
  41-snow-shoe-steps); `packed-*` *Walking in snow (42 steps, via qubodup)* by Corsica_S
  (OpenGameArt, 42-snow-and-gravel-footsteps); `ice-*` *Walking on Crunchy Ice (01/30/2014)* by
  courter (Freesound 447822); `slush-*` *Footsteps on slush* by xkeril (Freesound 611278).
- The weather's (docs/plan/65-the-weather.md, phase 9), picked by ear on `/dev/weather-sound`
  2026-11-02 from 41 candidates. All CC0 from Freesound (its HQ previews), made by
  `tools/sfx-weather.mjs` from `tools/sfx-weather.json`: the steps cut into single steps by onset
  and levelled to about −22 dB, mono 80 kb/s; the beds their steadiest 30 s, −24 dB RMS, stereo
  96 kb/s (the game crossfades the seam); thunder's peals cut and peaking at −3 dB, all six played.
  - `steps/grass-*`: *snd_footsteps_grass.wav* by drowsyprincess (Freesound 463854).
  - `steps/mud-*`: *Footsteps_Mountain_Boots_Mud_Mono.wav* by Nox_Sound (Freesound 548384).
  - `steps/wet-*`: *WetFootsteps.wav* by sqeeeek (Freesound 326543).
  - `steps/puddle-*`: *puddlewalk.wav* by j1987 (Freesound 106395).
  - `weather/rain-light.mp3`: *Light rain.wav* by Ryding (Freesound 96729).
  - `weather/rain-heavy.mp3`: *Rain heavy 2 (rural)* by jmbphilmes (Freesound 200272).
  - `weather/rain-trees.mp3`: *Soft Rain in Forest Raindrops fall on leaves* by Borgory (Freesound 678435).
  - `weather/rain-roof.mp3`: *January rain on a roof.aif* by mmorgaine (Freesound 333509).
  - `weather/rain-car.mp3`: *Ambiance_Rain_Inside_Car_Close_Roof_Loop_Stereo.wav* by Nox_Sound (Freesound 535870).
  - `weather/rain-water.mp3`: *Rain on pond* by Mjeno (Freesound 399281).
  - `weather/sleet.mp3`: *SleetNovember2014.WAV* by kvgarlic (Freesound 255741).
  - `weather/birds.mp3`: *Birds in the morning.wav* by Lord_Tarkus (Freesound 573283).
  - `weather/river.mp3`: *Water Stream 2* by sound368 (Freesound 786172).
  - `weather/drips.mp3`: *gully with water drips* by launemax (Freesound 249927).
  - `weather/thunder-near-*`: `a` *thunder 5 dry.wav* by elmoustachio (Freesound 476739); `b` *Thunder 07* by Emulius (Freesound 744722); `c` *Thunder Clap OWB KY 441x16.wav* by Dave Welsh (Freesound 194364).
  - `weather/thunder-far-*`: `a` *peal of thunder - distant* by bastipictures (Freesound 243782); `b` *Distant Thunder Clap_Gentle.wav* by mikala_oidua (Freesound 347562); `c` *Distant thunder in suburban area* by csengeri (Freesound 238743).
- The water's (docs/plan/66-the-water.md, phase 9), picked by ear on `/dev/water-sound`
  2026-11-03 from 65 candidates (the gasp and the breath a man's and a woman's, by the swimmer's
  gender). All CC0 from Freesound (its HQ previews), made by `tools/sfx-weather.mjs` from
  `tools/sfx-water.json` (`LIST=tools/sfx-water.json DIR=water`): the wades' and the soaked shoes'
  steps cut into single steps; the beds their steadiest 30 s; the rest cut into their events,
  peaking at −3 dB, mono 80 kb/s.
  - `steps/wade-shallow-*`: *Wading in Shallow Water.wav* by ryansitz (Freesound 342932).
  - `steps/wade-deep-*`: *River Wading Fast.mp3* by paulprit (Freesound 563555).
  - `steps/soaked-*`: *Feet Squelch* by eqavox (Freesound 683520).
  - `water/under.mp3`: *Underwater - seashore* by L.Finck (Freesound 815116).
  - `water/current.mp3`: *Hydrophone underwater flow* by Salomé_Lubczanski (Freesound 733812).
  - `water/pond-lap.mp3`: *Gentle lapping lake water waves cottage 24 96 180721.wav* by TRP (Freesound 573163).
  - `water/rapid.mp3`: *river rushing rapids close smooth liquidy detail.flac* by kyles (Freesound 454154).
  - `water/falls.mp3`: *Ambiance_Waterfall_Small_Close_Loop_Stereo.wav* by Nox_Sound (Freesound 698306).
  - `water/tread.mp3`: *water movements swimming around various splashes random.flac* by kyles (Freesound 637958).
  - `water/drip-body.mp3`: *dripping-laundry3.WAV* by maryannem (Freesound 528478).
  - `water/in-step-*`: *footsteps in a water puddle* by launemax (Freesound 249911).
  - `water/in-jump-*`: *Foley_Natural_Water_Jump_Mono.wav* by Nox_Sound (Freesound 585744).
  - `water/in-dive-*`: *splash body dive into water pool.flac* by kyles (Freesound 637823).
  - `water/in-fall-*`: *R23-45-Jumping Into Water.wav* by craigsmith (Freesound 480846).
  - `water/car-sink-*`: *glug_glug_glug.wav* by noisymichael (Freesound 661609).
  - `water/ice-crack-*`: *Breaking ice on frozen pond* by snds_good (Freesound 554856).
  - `water/stroke-breast-*`: *Creek Swimming.mp3* by JazzyBay (Freesound 435055).
  - `water/stroke-crawl-*`: *G54-26-Person Swimming.wav* by craigsmith (Freesound 438845).
  - `water/bubbles-*`: *Bubbles_01.wav* by cartoonrob (Freesound 588468).
  - `water/gasp-man-*`: *Gasp Inhale* by u3190 (Freesound 169931).
  - `water/gasp-woman-*`: *female sharp inhale sounds* by marythewitch (Freesound 535243).
  - `water/breathless-man-*`: *heavy breathing.wav* by simone_ds (Freesound 366077).
  - `water/breathless-woman-*`: *woman run and breath.wav* by MelvinJaepel (Freesound 435468).
  - `water/climb-out-*`: *water movement body step out of pool splash drips.flac* by kyles (Freesound 637948).
- The guns' (docs/plan/79-the-guns.md, phase 9), picked by ear on `/dev/gun-sound` 2026-11-12 from
  159 candidates. All CC0 from Freesound (its HQ previews), found by `tools/sfx-guns-search.mjs` and made
  by `tools/sfx-weather.mjs` from `tools/sfx-guns.json` (`DIR=guns`): cut into takes by onset, each to
  −3 dB peak, mono 80 kb/s (a reload's moment one take of a longer recording); the game sets their mix
  (`world/dark/voices.ts` GUN_LEVEL).
  - `guns/revolver-near-*`: *357 Magnum Revolver Gunshot with Tail* by Shark_Anthony (Freesound 683175).
  - `guns/revolver-in-*`: *Gunshot_001.wav* by Brokenphono (Freesound 344143).
  - `guns/revolver-far-*`: *Gun_Shot_86* by SignatureSoundsOrg (Freesound 876005).
  - `guns/shotgun-near-*`: *shotgun shoot* by MrGungus (Freesound 773873).
  - `guns/shotgun-in-*`: *Mossberg 500A - 1 shot and pump* by AnthonyChan0 (Freesound 159710).
  - `guns/shotgun-far-*`: *Very distant shot.wav* by moosegravy (Freesound 431828).
  - `guns/ak-near-*`: *Gun Version 2 without forward bolt* by SuperPhat (Freesound 414826).
  - `guns/ak-in-*`: *AR15 Indoors (open windows)* by modusmogulus (Freesound 815698).
  - `guns/ak-far-*`: *Distant Gunshot* by Resaural (Freesound 541164).
  - `guns/sniper-near-*`: *Sniper Shot in Field 3 (M2010 Enhanced Sniper Rifle ESR)* by qubodup (Freesound 855608).
  - `guns/sniper-in-*`: *Smith & Wesson 686 Plus 4 Inch Barrel .357 Mag* by AugustSandberg (Freesound 231248).
  - `guns/sniper-far-*`: *Distant Gunshot* by Resaural (Freesound 541164).
  - `guns/daybreak-charge-*`: *Laser Charge Up (Stronger)* by magnuswaker (Freesound 592573).
  - `guns/daybreak-fire-*`: *laser blast.wav* by pointparkcinema (Freesound 407251).
  - `guns/daybreak-ball-*`: *Scifi_Generator_Lp* by Euphrosyyn (Freesound 452768).
  - `guns/daybreak-burst-*`: *Ion Cannon* by qubodup (Freesound 814049).
  - `guns/daybreak-burst-far-*`: *Distant Explosion* by danlucaz (Freesound 517747).
  - `guns/draw-*`: *Gun draw holster.wav* by huddwink (Freesound 239959).
  - `guns/holster-*`: *GUN HOLSTER.wav* by MTJohnson (Freesound 426314).
  - `guns/revolver-dry-*`: *22lr revolver handling clicking foley* by serøutōnin--deprivəd (Freesound 677159).
  - `guns/shotgun-dry-*`: *Remington 870 pull up and dry fire* by areniporgen (Freesound 702662).
  - `guns/rifle-dry-*`: *A rifle being dry fired once* by serøutōnin--deprivəd (Freesound 725402).
  - `guns/case-snow-*`: *empty shotgun shells/casings hitting ground bouncing* by Metrolynn (Freesound 620929).
  - `guns/case-floor-*`: *BLLTShel_30CAL BULLET DROP_MP.wav* by MPierluissi (Freesound 460859).
  - `guns/shell-snow-*`: *Shotgun shell hitting ground* by toadridingbike (Freesound 759624).
  - `guns/shell-floor-*`: *12 guage shotgun shell drop* by MrGungus (Freesound 773860).
  - `guns/revolver-open-*`: *Weapon_Revolver_Hammer_Mono.wav* by Nox_Sound (Freesound 540065).
  - `guns/revolver-eject-*`: *Double Action Revolver Empty Chamber.wav* by shelbyshark (Freesound 501562).
  - `guns/revolver-speedloader-*`: *Revolver Reload Break 2* by tkane0512 (Freesound 722902).
  - `guns/revolver-close-*`: *Revolver Cocking.wav* by ajoyce86 (Freesound 240698).
  - `guns/revolver-cock-*`: *Cocking a revolver* by acidsnowflake (Freesound 402790).
  - `guns/shotgun-break-*`: *Single Barreled Shotgun Loading.wav* by sentryx86 (Freesound 52202).
  - `guns/shotgun-eject-*`: *Single Barreled Shotgun Loading.wav* by sentryx86 (Freesound 52202).
  - `guns/shotgun-shell-*`: *Shotgun Shell Load* by Bratish (Freesound 500293).
  - `guns/shotgun-close-*`: *Toy Double Barrel Shotgun Reloading* by JumboSizedFish (Freesound 693507).
  - `guns/ak-mag-out-*`: *Gun Ammunition Ejecting Thick.mp3* by mrrap4food (Freesound 618992).
  - `guns/ak-mag-in-*`: *Assault Rifle Reload* by qubodup (Freesound 815879).
  - `guns/ak-rack-*`: *Wasr RPK Charge Back1.mp3* by Pjkasinski3 (Freesound 171632).
  - `guns/sniper-bolt-open-*`: *Mosin Nagant Bolt.wav* by rammbostein (Freesound 263459).
  - `guns/sniper-bolt-close-*`: *Russian Mosin-Nagant Bolt.wav* by shelbyshark (Freesound 508244).
  - `guns/sniper-round-*`: *Pushing 50 Cal BMG Round into Magazine* by qubodup (Freesound 855580).
  - `guns/daybreak-cell-out-*`: *Arming a Sci-Fi Gun* by jackolous (Freesound 645778).
  - `guns/daybreak-cell-in-*`: *Arming a Sci-Fi Gun* by jackolous (Freesound 645778).
