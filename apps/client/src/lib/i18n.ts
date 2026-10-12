"use client";

import { useCallback, useSyncExternalStore } from "react";

// Interface text in EN and PT-BR, following the browser unless picked in
// settings (same convention as Yondra's Vortex rack). Vortex's lines stay English.
export type Lang = "en" | "pt";
const KEY = "yutopia:lang";
const subs = new Set<() => void>();

export function lang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "en" || v === "pt") return v;
    return navigator.language?.toLowerCase().startsWith("pt") ? "pt" : "en";
  } catch {
    return "en";
  }
}

export function setLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {}
  for (const s of subs) s();
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    lang,
    () => "en",
  );
}

const D = {
  tagline: ["Your team's studio. Walk in.", "O estúdio do seu time. Pode entrar."],
  signIn: ["Sign in with your Yondra account", "Entre com sua conta Yondra"],
  email: ["Email", "E-mail"],
  password: ["Password", "Senha"],
  enter: ["Enter", "Entrar"],
  signingIn: ["Signing in…", "Entrando…"],
  badLogin: ["Wrong email or password.", "E-mail ou senha incorretos."],
  noAccount: ["No account? Create one in Yondra.", "Sem conta? Crie uma no Yondra."],
  handoff: ["Coming in from Yondra…", "Chegando do Yondra…"],
  handoffFail: ["That link expired. Sign in instead.", "Esse link expirou. Entre com sua conta."],
  pickSpace: ["Pick a studio", "Escolha um estúdio"],
  noSpaces: [
    "You're not in any Yondra project yet. Create or join one in Yondra first.",
    "Você ainda não está em nenhum projeto do Yondra. Crie ou entre em um no Yondra primeiro.",
  ],
  online: ["online", "online"],
  nobody: ["empty", "vazio"],
  editAvatar: ["Edit avatar", "Editar avatar"],
  signOut: ["Sign out", "Sair"],
  join: ["Walk in", "Entrar"],
  loading: ["Loading…", "Carregando…"],
  connecting: ["Tuning in…", "Sintonizando…"],
  reconnecting: ["Signal lost — reconnecting…", "Sinal perdido — reconectando…"],
  kicked: ["You opened Yutopia in another tab.", "Você abriu o Yutopia em outra aba."],
  removed: ["An owner removed you from this studio for a while.", "Um dono te tirou deste estúdio por um tempo."],
  mute: ["Mute", "Silenciar"],
  unmute: ["Unmute", "Liberar fala"],
  remove: ["Remove", "Remover"],
  lockRoom: ["Lock room", "Trancar sala"],
  unlockRoom: ["Unlock room", "Destrancar sala"],
  lockedBy: ["locked by", "trancada por"],
  failed: ["Couldn't reach the studio.", "Não deu para chegar ao estúdio."],
  retry: ["Try again", "Tentar de novo"],
  back: ["Back", "Voltar"],
  save: ["Save", "Salvar"],
  saved: ["Saved", "Salvo"],
  randomize: ["Shuffle", "Embaralhar"],
  body: ["Body", "Corpo"],
  skin: ["Skin", "Pele"],
  hair: ["Hair", "Cabelo"],
  hairColor: ["Hair colour", "Cor do cabelo"],
  top: ["Top", "Parte de cima"],
  topColor: ["Top colour", "Cor de cima"],
  bottom: ["Bottom", "Parte de baixo"],
  bottomColor: ["Bottom colour", "Cor de baixo"],
  accessory: ["Accessory", "Acessório"],
  accessoryColor: ["Accessory colour", "Cor do acessório"],
  mic: ["Mic", "Microfone"],
  cam: ["Camera", "Câmera"],
  screen: ["Share screen", "Compartilhar tela"],
  chat: ["Chat", "Chat"],
  people: ["People", "Pessoas"],
  emote: ["Emote", "Reação"],
  settings: ["Settings", "Ajustes"],
  build: ["Build", "Construir"],
  leave: ["Leave", "Sair"],
  status_online: ["Available", "Disponível"],
  status_away: ["Away", "Ausente"],
  status_dnd: ["Focus (do not disturb)", "Foco (não perturbe)"],
  nearby: ["Nearby", "Por perto"],
  area: ["This room", "Esta sala"],
  space: ["Everyone", "Todos"],
  sayNearby: ["Say something to people nearby…", "Diga algo para quem está por perto…"],
  sayArea: ["Say something to this room…", "Diga algo para esta sala…"],
  saySpace: ["Say something to everyone…", "Diga algo para todos…"],
  noMessages: ["Quiet in here.", "Silêncio por aqui."],
  goTo: ["Go to", "Ir até"],
  myDesk: ["My desk", "Minha mesa"],
  follow: ["Follow", "Seguir"],
  unfollow: ["Stop following", "Parar de seguir"],
  doing: ["Doing", "Fazendo"],
  nothingDoing: ["Nothing in progress", "Nada em andamento"],
  pressToOpen: ["to open", "para abrir"],
  pressToUse: ["to use", "para usar"],
  openBoard: ["Open board", "Abrir quadro"],
  openInYondra: ["Open in Yondra", "Abrir no Yondra"],
  close: ["Close", "Fechar"],
  knocking: ["is knocking", "está batendo"],
  letIn: ["Let in", "Deixar entrar"],
  ignore: ["Ignore", "Ignorar"],
  devices: ["Devices", "Dispositivos"],
  microphone: ["Microphone", "Microfone"],
  camera: ["Camera", "Câmera"],
  speakers: ["Speakers", "Alto-falantes"],
  mixer: ["Mixer", "Mixer"],
  master: ["Master", "Geral"],
  voices: ["Voices", "Vozes"],
  ambience: ["Ambience", "Ambiente"],
  music: ["Music", "Música"],
  effects: ["Effects", "Efeitos"],
  quality: ["Graphics", "Gráficos"],
  qualityAuto: ["Auto (fits this device)", "Auto (conforme o aparelho)"],
  qualityHigh: ["High (light, bloom, film look)", "Alta (luz, brilho, visual de filme)"],
  qualityMedium: ["Medium (light, life)", "Média (luz, vida)"],
  qualityLow: ["Low (battery saver)", "Baixa (economia de bateria)"],
  reducedMotion: ["Reduced motion", "Movimento reduzido"],
  noiseSuppression: ["Noise suppression", "Supressão de ruído"],
  language: ["Language", "Idioma"],
  spatialAudio: ["Spatial audio", "Áudio espacial"],
  controls: ["Controls", "Controles"],
  controlsHelp: [
    "WASD / arrows to walk · click to walk there · Shift to run · X to interact · Enter to chat · 1–8 emotes · M mic · V camera · Esc closes",
    "WASD / setas para andar · clique para ir até lá · Shift para correr · X para interagir · Enter para o chat · 1–8 reações · M microfone · V câmera · Esc fecha",
  ],
  micBlocked: ["Microphone blocked — allow it in the browser.", "Microfone bloqueado — libere no navegador."],
  camBlocked: ["Camera blocked — allow it in the browser.", "Câmera bloqueada — libere no navegador."],
  avNotReady: ["Voice is still connecting…", "A voz ainda está conectando…"],
  avOffline: [
    "Voice/video server unreachable — you can still walk and chat.",
    "Servidor de voz/vídeo fora do ar — dá para andar e conversar mesmo assim.",
  ],
  inYutopia: ["in Yutopia", "no Yutopia"],
  minimap: ["Map", "Mapa"],
  standup: ["Standup", "Daily"],
  standupStart: ["Start standup", "Começar daily"],
  standupNext: ["Next", "Próximo"],
  standupStop: ["End", "Encerrar"],
  standupTurn: ["'s turn", " fala agora"],
  standupYours: ["Your turn", "Sua vez"],
  standupDone: ["Standup done. Back to work.", "Daily encerrada. Bora trabalhar."],
  poker: ["Planning poker", "Planning poker"],
  pokerTopic: ["What are we estimating?", "O que vamos estimar?"],
  pokerOpen: ["Start round", "Começar rodada"],
  pokerReveal: ["Reveal", "Revelar"],
  pokerClose: ["Close round", "Fechar rodada"],
  pokerWaiting: ["votes in", "votos"],
  pokerPickCard: ["Pick a card from Yondra", "Escolha um card do Yondra"],
  pokerSave: ["Save estimate to card", "Salvar estimativa no card"],
  radio: ["Lo-fi radio", "Rádio lo-fi"],
  radioPlay: ["Play", "Tocar"],
  radioStop: ["Stop", "Parar"],
  radioStation: ["Station", "Estação"],
  whiteboard: ["Whiteboard", "Quadro branco"],
  arcade: ["Arcade", "Fliperama"],
  notice: ["Notice board", "Mural"],
  screenShare: ["Big screen", "Telão"],
  screenNobody: [
    "Nobody is sharing. Stand on the stage and share your screen.",
    "Ninguém compartilhando. Suba no palco e compartilhe sua tela.",
  ],
  coffee: ["Coffee", "Café"],
  coffeeMade: ["You made a coffee. ☕", "Você fez um café. ☕"],
  terminal: ["Terminal", "Terminal"],
  buildMode: ["Build mode", "Modo construção"],
  buildHelp: [
    "Pick an item, click to place · R rotates · click an item to pick it up · Del removes · Esc exits",
    "Escolha um item, clique para colocar · R gira · clique num item para pegar · Del remove · Esc sai",
  ],
  buildNoRights: ["Only project owners can rearrange the studio.", "Só donos do projeto podem reorganizar o estúdio."],
  welcome: ["Welcome to", "Bem-vindo ao"],
  firstTime: ["First time? Make your avatar.", "Primeira vez? Monte seu avatar."],
  you: ["you", "você"],
  away: ["away", "ausente"],
  focus: ["focus", "foco"],
  seated: ["at their desk", "na mesa"],
  joinThem: ["Join them", "Ir até lá"],
} as const;

export type Key = keyof typeof D;

export function tr(key: Key, l: Lang = lang()): string {
  return D[key][l === "pt" ? 1 : 0];
}

// Stable per language, so it's safe in effect dependencies.
export function useTr(): (key: Key) => string {
  const l = useLang();
  return useCallback((key: Key) => tr(key, l), [l]);
}
