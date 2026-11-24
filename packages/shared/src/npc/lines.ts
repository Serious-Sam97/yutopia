import { biOf, type NpcDef, type Words } from "./cast.ts";

// What anyone says for a moment that has no line of their own (docs/plan/123-npcs-alive.md, F4c): the cast's lines
// first (the page sets them per NPC), these else — each in both languages. A job's own words for an order and its
// serving; a day asked about by their mood.

const w = (en: string, pt: string): Words => ({ en, pt });

export const DEFAULT_LINES: Record<string, Words[]> = {
  greet: [w("Hi there!", "Oi!"), w("Hey, how's it going?", "E aí, tudo bem?"), w("Good to see you.", "Bom te ver.")],
  answer: [w("Mm?", "Hm?"), w("Yes?", "Sim?"), w("What's up?", "Fala!")],
  joke: [
    w(
      "Why did the snowman smile? The snowblower was coming.",
      "Sabe por que o boneco de neve sorriu? Lá vinha a máquina de neve.",
    ),
    w(
      "I told my coffee a joke. It didn't get it — too bitter.",
      "Contei uma piada pro meu café. Ele não riu — amargo demais.",
    ),
    w("I'm on a seafood diet. I see food, I eat it.", "Tô numa dieta de frutos do mar: vejo comida, como."),
  ],
  laugh: [
    w("Ha! Good one.", "Haha! Essa foi boa."),
    w("Hah, I needed that.", "Haha, eu precisava dessa."),
    w("You're funny.", "Você é engraçado."),
  ],
  compliment: [
    w("Oh, thank you!", "Ah, obrigado!"),
    w("That's kind of you.", "Que gentil."),
    w("You made my day.", "Você ganhou meu dia."),
  ],
  "day:happy": [w("Great, honestly!", "Ótimo, sério!"), w("Couldn't be better.", "Não podia estar melhor.")],
  "day:fine": [w("Not bad, you?", "Nada mal, e você?"), w("Same as ever.", "O de sempre.")],
  "day:uneasy": [w("Could be better.", "Podia ser melhor."), w("Long day.", "Dia longo.")],
  "day:sad": [w("Not great, to be honest.", "Não muito bem, pra ser sincero."), w("Rough one.", "Dia difícil.")],
  "day:cross": [w("Don't ask.", "Nem pergunta."), w("Ugh.", "Argh.")],
  job: [
    w("Keeps me busy.", "Me mantém ocupado."),
    w("I like it here.", "Eu gosto daqui."),
    w("It pays the rent.", "Paga o aluguel."),
  ],
  chat: [
    w("Did you see the snow this morning?", "Viu a neve de manhã?"),
    w("The diner's got a new pie.", "O diner tem torta nova."),
    w("Long time no see!", "Quanto tempo!"),
    w("How's the family?", "E a família?"),
  ],
  order: [w("What can I get you?", "O que vai ser?"), w("Coming right up.", "Saindo já.")],
  served: [w("Here you go.", "Aqui está."), w("Enjoy!", "Aproveite!")],
  refuse: [
    w("Uh, let's not.", "Hã, melhor não."),
    w("Maybe not.", "Talvez não."),
    w("I'd rather not.", "Prefiro não."),
  ],
  thanks: [w("Oh, for me? Thanks!", "Pra mim? Valeu!"), w("You shouldn't have!", "Não precisava!")],
};
/** What a job says taking an order (their own work, said). */
export const JOB_ORDER: Record<string, Words> = {
  barista: w("One coffee, coming up.", "Um café, saindo."),
  bartender: w("What are we drinking?", "O que vai beber?"),
  cook: w("Order up in a minute.", "Seu prato já sai."),
  waiter: w("I'll bring it right over.", "Já trago."),
  cashier: w("That'll be all?", "Só isso?"),
};

/** A line for the moment, EN|PT (`biOf`): one of theirs, else a default (`day` by their mood: "day:happy"…); "" if
 *  none. */
export function lineFor(d: Pick<NpcDef, "lines">, when: string, rand: () => number, mood?: string): string {
  const own = d.lines.filter((l) => l.when === when);
  if (own.length) return biOf(own[Math.floor(rand() * own.length)]);
  const key = when === "day" && mood ? `day:${mood}` : when;
  const list = DEFAULT_LINES[key] ?? DEFAULT_LINES[when] ?? [];
  return list.length ? biOf(list[Math.floor(rand() * list.length)]) : "";
}
