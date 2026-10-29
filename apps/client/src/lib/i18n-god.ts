// God mode's interface text (docs/plan/53-the-god-mode.md, EN · PT-BR), loaded with its chunk
// (world/god/controller.ts calls addStrings) so the world page stays within its budget. The tag
// over a body in god mode ("building") stays on the page: everyone sees it.
export const GOD_STRINGS = {
  godIn: ["God mode · only you see your draft until you publish", "Modo deus · só você vê seu rascunho até publicar"],
  godKept: ["“{name}” kept: {n} changes, for next time", "“{name}” guardado: {n} mudanças, para a próxima"],
  godSaved: ["Saved: {name}", "Salvo: {name}"],
  godDraftN: ["Draft {n}", "Rascunho {n}"],
  godDraftCopy: ["{name} · copy", "{name} · cópia"],
  godDraftFailed: ["The draft: {why}", "O rascunho: {why}"],
  godDraftGone: ["That draft couldn't be opened", "Esse rascunho não pôde ser aberto"],
  godDraftDeleted: ["Deleted: {name}", "Apagado: {name}"],
  godMerged: [
    "Revision {rev} was published: your draft is up to date with it. Where both changed the same thing, yours was kept: {what}.",
    "A revisão {rev} foi publicada: seu rascunho foi atualizado. Onde os dois mudaram a mesma coisa, o seu ficou: {what}.",
  ],
  godOverlap_height: ["the land in {n} chunks", "o terreno em {n} blocos"],
  godOverlap_paint: ["the paint in {n} chunks", "a pintura em {n} blocos"],
  godOverlap_trees: ["the trees in {n} chunks", "as árvores em {n} blocos"],
  godOverlap_ways: ["{n} ways", "{n} vias"],
  godOverlap_things: ["{n} things", "{n} coisas"],
  godOverlap_buildings: ["{n} buildings", "{n} prédios"],
  godPublished: ["Revision {rev} published: everyone has it now", "Revisão {rev} publicada: todos já a têm"],
  godSaveFailed: ["The draft couldn't be saved: try again", "O rascunho não pôde ser salvo: tente de novo"],
  godToolSoon: ["{tool} comes in the next phase of god mode", "{tool} chega na próxima fase do modo deus"],
  godWayLocked: [
    "{why}: it can be widened or lit, not moved nor taken away",
    "{why}: pode ser alargada ou iluminada, não movida nem tirada",
  ],
  godWayBlocked: ["Not there: {why}", "Não aí: {why}"],
  godThingLocked: ["{why}: it stays where it is", "{why}: fica onde está"],
  godThingBlocked: ["Not there: {why}", "Não aí: {why}"],
  godWayRemoved: ["{name} taken away (undo brings it back)", "{name} tirada (desfazer a traz de volta)"],
  godTool_select: ["Select", "Selecionar"],
  godTool_land: ["Land", "Terreno"],
  godTool_paint: ["Paint", "Pintar"],
  godTool_roads: ["Roads", "Vias"],
  godTool_nature: ["Nature", "Natureza"],
  godTool_things: ["Things", "Coisas"],
  godTool_buildings: ["Buildings", "Prédios"],
} as const;

export type GodKey = keyof typeof GOD_STRINGS;
