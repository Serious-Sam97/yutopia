import type { NpcHours, NpcShots, NpcTalk, NpcType } from "@yutopia/shared/npc";

// The cast page's words (docs/plan/120-god-mode-npcs.md), EN / PT-BR, as the other admin pages keep theirs.
export const W = {
  title: ["The cast", "Elenco"],
  sub: [
    "Every NPC in the world. A change is saved as you make it; the town's people take it on at once.",
    "Todos os NPCs do mundo. Cada mudança é salva na hora; o pessoal da cidade já aparece com ela.",
  ],
  back: ["Back to the world", "Voltar ao mundo"],
  notAllowed: ["Only admins can see this page.", "Só admins podem ver esta página."],
  loading: ["Loading…", "Carregando…"],
  failed: ["Couldn't load the cast.", "Não deu para carregar o elenco."],
  notSeeded: [
    "The town's people come in the first time the world opens.",
    "O pessoal da cidade entra na primeira vez que o mundo abre.",
  ],
  search: ["Search by name, role or notes", "Buscar por nome, papel ou notas"],
  all: ["All", "Todos"],
  town: ["The town's", "Da cidade"],
  made: ["Made here", "Criados aqui"],
  count: ["{n} of {max}", "{n} de {max}"],
  none: ["Nobody matches.", "Ninguém bate com a busca."],
  new: ["New", "Novo"],
  random: ["Random", "Aleatório"],
  copy: ["Copy", "Copiar"],
  delete: ["Delete", "Apagar"],
  newName: ["New NPC", "Novo NPC"],
  copyName: ["{n} · copy", "{n} · cópia"],
  townBadge: ["the town's", "da cidade"],
  offMap: ["not on the map yet", "ainda fora do mapa"],
  // (plan 121) where God mode placed them, where they live
  placedOut: ["placed · outdoors", "colocado · ao ar livre"],
  placedIn: ["placed · indoors", "colocado · num interior"],
  livesIn: ["lives in {n}", "mora em {n}"],
  whereTitle: ["On the map", "No mapa"],
  whereNone: [
    "Not on the map: God mode's NPCs tool (N) puts them there.",
    "Fora do mapa: a ferramenta NPCs do God Mode (N) coloca.",
  ],
  whereTown: [
    "Where their own ways have them (not placed in God mode).",
    "Onde a rotina deles os leva (não colocado no God Mode).",
  ],
  whereAt: ["{n} · facing {a}°", "{n} · olhando {a}°"],
  pick: ["Pick someone from the list, or make someone new.", "Escolha alguém da lista, ou crie alguém."],
  // the editor
  name: ["Name", "Nome"],
  roleEn: ["Role · English", "Papel · inglês"],
  rolePt: ["Role · Portuguese", "Papel · português"],
  roleHint: [
    "Shown after the name over their head. Portuguese empty: the English one.",
    "Aparece depois do nome, sobre a cabeça. Português vazio: vale o inglês.",
  ],
  voice: ["Voice", "Voz"],
  man: ["A man's", "Masculina"],
  woman: ["A woman's", "Feminina"],
  tabLook: ["Look", "Visual"],
  tabLines: ["Lines", "Falas"],
  tabBehaviour: ["Behaviour", "Comportamento"],
  tabNotes: ["Notes", "Notas"],
  lookTitle: ["Their look", "O visual"],
  vortexLook: [
    "Vortex's look is the mascot's own, as is his fight. His name, lines and notes are yours to change.",
    "O visual do Vortex é o do mascote, assim como a luta. Nome, falas e notas você pode mudar.",
  ],
  saving: ["Saving…", "Salvando…"],
  saved: ["Saved", "Salvo"],
  notSaved: ["Not saved: trying again", "Não salvou: tentando de novo"],
  needName: ["Not saved: give them a name or a role", "Não salvou: dê um nome ou um papel"],
  unsaved: ["Changes still being saved. Leave anyway?", "Ainda salvando mudanças. Sair mesmo assim?"],
  // lines
  linesHint: [
    "What they say. English is said where Portuguese is empty. Up to {n} lines, 140 letters each.",
    "O que eles dizem. Onde o português está vazio, vale o inglês. Até {n} falas, 140 letras cada.",
  ],
  vortexLines: [
    "His public lines, by what's going on. The personal ones (with your name) stay his own.",
    "As falas públicas dele, por momento. As pessoais (com o seu nome) continuam dele.",
  ],
  when: ["When", "Quando"],
  en: ["English", "Inglês"],
  pt: ["Portuguese", "Português"],
  addLine: ["Add a line", "Adicionar fala"],
  up: ["Up", "Subir"],
  down: ["Down", "Descer"],
  remove: ["Remove", "Remover"],
  noLines: ["No lines: they say nothing.", "Sem falas: não dizem nada."],
  // behaviour
  type: ["What they do", "O que fazem"],
  ownType: ["Their own", "O próprio"],
  ownHint: [
    "The town's people keep what they've always done. Applied now: pace and how often they talk. Hours and reactions are kept for later.",
    "O pessoal da cidade continua fazendo o que sempre fez. Já vale: ritmo e de quanto em quanto fala. Horário e reações ficam guardados para depois.",
  ],
  madeHint: [
    "Kept for when they're put on the map (the next ticket).",
    "Guardado para quando forem colocados no mapa (o próximo ticket).",
  ],
  hours: ["When they're about", "Quando aparecem"],
  from: ["From", "Das"],
  to: ["To", "Às"],
  pace: ["Pace", "Ritmo"],
  byGait: ["By their walk", "Pelo jeito de andar"],
  talk: ["How often they talk", "De quanto em quanto falam"],
  greet: ["Say hello to someone coming near", "Cumprimentam quem chega perto"],
  answer: ["Answer when talked to (X)", "Respondem quando falam com eles (X)"],
  reactions: ["Reactions", "Reações"],
  // (plan 123) who they are
  traits: ["Who they are", "Quem são"],
  byKey: ["Their own (from their key)", "Do jeito deles (pela chave)"],
  outgoing: ["Shy · Outgoing", "Tímido · Extrovertido"],
  active: ["Laid-back · Active", "Tranquilo · Ativo"],
  neat: ["Messy · Neat", "Bagunceiro · Organizado"],
  cheerful: ["Grumpy · Cheerful", "Ranzinza · Alegre"],
  shots: ["Shots near them", "Tiros por perto"],
  notes: ["Notes for admins", "Notas para admins"],
  notesHint: ["Only admins see these. Up to 1000 letters.", "Só admins veem. Até 1000 letras."],
  // deleting
  delTitle: ["Delete {n}?", "Apagar {n}?"],
  delTown: [
    "They're one of the town's: deleted, they don't come back.",
    "É do pessoal da cidade: apagado, não volta mais.",
  ],
  delMade: ["They're not on the map: nothing in the world changes.", "Não está no mapa: nada muda no mundo."],
  cancel: ["Keep them", "Manter"],
  yesDelete: ["Delete", "Apagar"],
} as const;
export type Word = keyof typeof W;

/** What happens in the world when a town NPC is deleted, by their type. */
export const GONE: Record<string, [string, string]> = {
  "guard-rounds": [
    "The gatehouse will be empty, and nobody walks the fence at night.",
    "A guarita fica vazia, e ninguém faz a ronda da cerca à noite.",
  ],
  "kart-control": ["The Kart Park's race desk will have nobody at it.", "A mesa de prova do kart fica sem ninguém."],
  "kart-mechanic": ["The kart up on its stand will have nobody at it.", "O kart no cavalete fica sem ninguém."],
  "kart-cocoa": ["The cocoa cart will have nobody at it.", "O carrinho de chocolate quente fica sem ninguém."],
  "kart-visitor": ["The Kart Park will have one visitor fewer.", "O kart fica com um visitante a menos."],
  vortex: [
    "The studio loses Vortex and his fight, and the game tables lose their Vortex (the computer still plays).",
    "O estúdio perde o Vortex e a luta dele, e as mesas de jogo perdem o Vortex (o computador continua jogando).",
  ],
  "strike-recruit": [
    "The Strike Park's lobby will have one recruit fewer.",
    "O saguão do Strike Park fica com um recruta a menos.",
  ],
};
export const GONE_POST: [string, string] = [
  "Their post in the Strike Park's lobby will have nobody at it.",
  "O posto dele no saguão do Strike Park fica sem ninguém.",
];

export const TYPE_WORDS: Record<NpcType, [string, string]> = {
  stand: ["Stands at a spot", "Fica parado num ponto"],
  wander: ["Wanders an area", "Passeia por uma área"],
  route: ["Walks a route", "Faz uma rota"],
  counter: ["Keeps a counter or a shop", "Cuida de um balcão ou loja"],
  sit: ["Sits", "Fica sentado"],
  "guard-rounds": [
    "By day at the gatehouse; at night, the fence's rounds",
    "De dia na guarita; à noite, a ronda da cerca",
  ],
  "kart-control": ["Race control, at the Kart Park's desk", "Direção de prova, na mesa do kart"],
  "kart-mechanic": ["The mechanic, at the kart on its stand", "O mecânico, no kart do cavalete"],
  "kart-cocoa": ["At the Kart Park's cocoa cart", "No carrinho de chocolate do kart"],
  "kart-visitor": [
    "A visitor: the cocoa, the fire's benches, the rack, the stands, the podium",
    "Um visitante: o chocolate, os bancos da fogueira, o rack, a arquibancada, o pódio",
  ],
  vortex: [
    "The studio's mascot: wanders, dances to the radio, sleeps, fights back",
    "O mascote do estúdio: passeia, dança com o rádio, dorme, revida",
  ],
  "strike-quartermaster": ["The Strike Park's quartermaster, at the armory", "O intendente do Strike Park, no arsenal"],
  "strike-instructor": ["The Strike Park's instructor, by the desk", "O instrutor do Strike Park, na mesa"],
  "strike-cook": ["The Strike Park's cook, in the canteen", "A cozinheira do Strike Park, na cantina"],
  "strike-keeper": ["The Strike Park's barkeeper", "O dono do bar do Strike Park"],
  "strike-officer": ["The Strike Park's officer, in the war room", "A oficial do Strike Park, na sala de guerra"],
  "strike-recruit": ["A recruit, walking between the lobby's rooms", "Um recruta, andando entre as salas do saguão"],
};
export const HOURS_WORDS: Record<NpcHours, [string, string]> = {
  always: ["Always", "Sempre"],
  day: ["By day", "De dia"],
  night: ["By night", "À noite"],
  shift: ["A shift", "Um turno"],
};
export const TALK_WORDS: Record<NpcTalk, [string, string]> = {
  never: ["Never", "Nunca"],
  rarely: ["Rarely", "Pouco"],
  sometimes: ["Sometimes", "Às vezes"],
  often: ["Often", "Muito"],
};
export const SHOTS_WORDS: Record<NpcShots, [string, string]> = {
  ignore: ["Take no notice", "Nem ligam"],
  duck: ["Duck", "Se abaixam"],
  flee: ["Run away", "Fogem"],
};
export const WHEN_WORDS: Record<string, [string, string]> = {
  ambient: ["On their own", "Sozinhos"],
  greet: ["Someone comes near", "Alguém chega perto"],
  answer: ["Talked to", "Quando falam com eles"],
  radio: ["The radio's on", "Rádio ligado"],
  night: ["At night", "À noite"],
  standup: ["A standup", "Uma daily"],
  sleep: ["Asleep", "Dormindo"],
  vortexos: ["VortexOS booted", "VortexOS ligado"],
  hit: ["Shot", "Baleado"],
  dodge: ["Dodges", "Desvia"],
  whip: ["The whip", "O chicote"],
  rew: ["Rewind", "Rebobinar"],
  pause: ["Pause", "Pausa"],
  steal: ["Takes a gun", "Pega uma arma"],
  blast: ["The blast", "A explosão"],
  dark: ["Lights out", "Luzes apagadas"],
  clones: ["Clones", "Clones"],
  shades: ["Shades", "Sombras"],
  possess: ["Possession", "Possessão"],
  glitch: ["Glitch", "Glitch"],
  down: ["Beaten", "Derrotado"],
};
/** A random NPC's first name. */
export const NAMES = [
  "Ada",
  "Bruno",
  "Clara",
  "Davi",
  "Elisa",
  "Felipe",
  "Gaia",
  "Hugo",
  "Iris",
  "Jonas",
  "Kira",
  "Leo",
  "Marina",
  "Nico",
  "Olga",
  "Paulo",
  "Rita",
  "Sara",
  "Tomás",
  "Vera",
  "Yara",
  "Zeca",
];
