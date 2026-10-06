import type { DayPlan, PhaseInfo } from './types';
import { REF_DRILLS } from './drills';

export const PROGRAM_ID = 'gospel-chops-30';
export const PROGRAM_NAME = 'Gospel Chops — 30 dias de treino';
export const PROGRAM_DAYS = 30;

export const PHASES: readonly PhaseInfo[] = [
  { id: 1, name: 'Fundamentos e consistência', goal: 'Movimentos limpos, regularidade e controle. Velocidade não é prioridade.' },
  { id: 2, name: 'Desenvolvimento dos rudimentos', goal: 'Paradiddles, combinações e acentos, com retomada da Fase 1.' },
  { id: 3, name: 'Velocidade e controle', goal: 'Ganhar velocidade sem perder precisão, com rajadas curtas e recuperação.' },
  { id: 4, name: 'Coordenação e vocabulário', goal: 'Levar os rudimentos para a bateria completa, mãos e pés juntos.' },
  { id: 5, name: 'Linguagem Gospel Chops', goal: 'Transformar rudimentos em frases rápidas e musicais.' },
  { id: 6, name: 'Integração e desempenho', goal: 'Consolidar, encadear viradas e avaliar a evolução.' },
];

type DayContent = Omit<DayPlan, 'day' | 'phase' | 'cycle'>;

const refs = [...REF_DRILLS];

/** Conteúdo dos 30 dias. Listas em ordem de prioridade: sessões curtas usam os primeiros itens. */
const DAYS: readonly DayContent[] = [
  // Fase 1 — Fundamentos e consistência
  { title: 'Avaliação inicial e singles básicos', focus: 'Medir o ponto de partida e começar singles regulares.', tests: true,
    warmup: ['warm-singles-8'], rudiments: refs, speed: ['singles-8'], coordination: ['warm-hands-feet'], subdivisions: ['singles-16'], application: ['coord-groove-rock'] },
  { title: 'Singles: alternância e consistência', focus: 'Mãos iguais e espaçamento uniforme.',
    warmup: ['warm-singles-8'], rudiments: ['singles-8', 'singles-16'], speed: ['singles-16'], coordination: ['warm-hands-feet', 'coord-hands-pedal'], subdivisions: ['singles-16-accent'], application: ['coord-groove-rock', 'fill-1beat'] },
  { title: 'Doubles e controle do rebote', focus: 'Dois toques iguais por mão.',
    warmup: ['warm-doubles-8'], rudiments: ['doubles-8', 'doubles-16', 'singles-16'], speed: ['doubles-16'], coordination: ['warm-hands-feet'], subdivisions: ['doubles-accent-2nd'], application: ['coord-groove-rock'] },
  { title: 'Singles e doubles alternados', focus: 'Trocar de toque simples para duplo sem mudar o som.',
    warmup: ['warm-singles-8', 'warm-doubles-8'], rudiments: ['combo-singles-doubles', 'singles-16', 'doubles-16'], speed: ['singles-16'], coordination: ['coord-hands-pedal'], subdivisions: ['singles-16-accent'], application: ['fill-1beat'] },
  { title: 'Revisão da Fase 1 + aplicação', focus: 'Consolidar singles e doubles e tocar a primeira virada.',
    warmup: ['warm-singles-16-soft'], rudiments: ['singles-16', 'doubles-16', 'combo-singles-doubles'], speed: ['singles-16'], coordination: ['coord-groove-rock'], subdivisions: ['singles-8'], application: ['fill-1beat', 'coord-groove-rock'] },
  // Fase 2 — Desenvolvimento dos rudimentos
  { title: 'Introdução ao paradiddle', focus: 'Sequência correta do paradiddle, devagar.',
    warmup: ['warm-singles-8'], rudiments: ['para-8', 'para-16', 'singles-16'], speed: ['para-16'], coordination: ['warm-hands-feet'], subdivisions: ['singles-16-accent'], application: ['fill-1beat'] },
  { title: 'Paradiddle com metrônomo', focus: 'Paradiddle fluido e estável no clique.',
    warmup: ['warm-paradiddle-8'], rudiments: ['para-16', 'para-8', 'doubles-16'], speed: ['para-16'], coordination: ['coord-hands-pedal'], subdivisions: ['accent-moving-16'], application: ['fill-2beat-toms'] },
  { title: 'Paradiddle com acentos', focus: 'Acentos claros e notas baixas controladas.',
    warmup: ['warm-paradiddle-8'], rudiments: ['para-16-accent', 'para-accent-moved', 'para-16'], speed: ['singles-16'], coordination: ['para-groove'], subdivisions: ['accent-moving-16'], application: ['fill-2beat-toms'] },
  { title: 'Paradiddle invertido e combinações', focus: 'Inverter o duplo e combinar com singles.',
    warmup: ['warm-paradiddle-8'], rudiments: ['para-inverted', 'para-plus-singles', 'combo-singles-doubles'], speed: ['para-16-accent'], coordination: ['para-groove'], subdivisions: ['singles-16-accent'], application: ['fill-paradiddle-2beat'] },
  { title: 'Revisão da Fase 2 + aplicação', focus: 'Paradiddles e doubles aplicados em viradas.',
    warmup: ['warm-singles-16-soft'], rudiments: ['para-16-accent', 'para-inverted', 'doubles-16', 'singles-16'], speed: ['singles-16'], coordination: ['para-groove', 'coord-groove-rock'], subdivisions: ['accent-moving-16'], application: ['fill-paradiddle-2beat', 'fill-doubles-2beat'] },
  // Fase 3 — Velocidade e controle
  { title: 'Singles em vários andamentos', focus: 'Velocidade com relaxamento: rajadas e recuperação.',
    warmup: ['warm-singles-16-soft'], rudiments: ['singles-16', 'singles-switch-8-16', 'doubles-16'], speed: ['singles-burst'], coordination: ['coord-singles-kick'], subdivisions: ['singles-switch-8-16'], application: ['fill-1beat', 'fill-4beat-toms'] },
  { title: 'Doubles com rebote controlado', focus: 'Segundo toque forte em andamentos maiores.',
    warmup: ['warm-doubles-8'], rudiments: ['doubles-16', 'doubles-accent-2nd', 'doubles-toms'], speed: ['doubles-16', 'singles-endurance'], coordination: ['coord-hands-pedal'], subdivisions: ['dynamics-ghost'], application: ['fill-doubles-2beat'] },
  { title: 'Tercinas e grupos de três', focus: 'Grupos de três notas e acentos trocando de mão.',
    warmup: ['warm-singles-8'], rudiments: ['singles-triplets', 'combo-groups-3', 'para-diddle'], speed: ['singles-burst'], coordination: ['coord-groove-rock'], subdivisions: ['accent-triplets', 'singles-switch-3-6'], application: ['fill-triplet'] },
  { title: 'Sextinas e grupos de seis', focus: 'Seis notas por tempo, base dos gospel chops.',
    warmup: ['warm-singles-16-soft'], rudiments: ['singles-sextuplets', 'combo-groups-6', 'para-diddle'], speed: ['singles-sextuplets'], coordination: ['coord-singles-kick'], subdivisions: ['accent-sextuplets-3', 'singles-switch-3-6'], application: ['fill-sextuplet'] },
  { title: 'Teste de meio de programa + dinâmica', focus: 'Comparar com o Dia 1 e trabalhar dinâmica.', tests: true,
    warmup: ['warm-singles-8'], rudiments: refs, speed: ['singles-burst'], coordination: ['coord-groove-16hh'], subdivisions: ['dynamics-ghost', 'singles-dynamics'], application: ['fill-4beat-toms', 'fill-sextuplet'] },
  // Fase 4 — Coordenação e vocabulário
  { title: 'Mãos e pés juntos', focus: 'Bumbo e pedal do chimbal sem atrapalhar as mãos.',
    warmup: ['warm-hands-feet'], rudiments: ['singles-16', 'para-16-accent'], speed: ['singles-endurance'], coordination: ['coord-singles-kick', 'coord-hands-pedal'], subdivisions: ['accent-moving-16'], application: ['coord-groove-16hh', 'fill-1beat'] },
  { title: 'Groove com variações de caixa e chimbal', focus: 'Ghost notes e chimbal com as duas mãos.',
    warmup: ['warm-hands-feet'], rudiments: ['dynamics-ghost', 'para-16'], speed: ['doubles-16'], coordination: ['coord-ghost-groove', 'coord-groove-16hh'], subdivisions: ['dynamics-ghost'], application: ['fill-2beat-toms'] },
  { title: 'Rudimentos pelos tons', focus: 'Distribuir singles, doubles e paradiddles pela bateria.',
    warmup: ['warm-singles-16-soft'], rudiments: ['singles-toms', 'doubles-toms', 'para-toms'], speed: ['singles-burst'], coordination: ['coord-groove-rock'], subdivisions: ['accent-triplets'], application: ['fill-4beat-toms', 'fill-paradiddle-2beat'] },
  { title: 'Bumbo dentro da frase: RLK', focus: 'Primeiros lineares mão-mão-pé.',
    warmup: ['warm-hands-feet'], rudiments: ['singles-triplets', 'singles-sextuplets'], speed: ['singles-sextuplets'], coordination: ['coord-rlk', 'coord-rlkk'], subdivisions: ['singles-switch-3-6'], application: ['fill-triplet', 'coord-rlk-toms'] },
  { title: 'Viradas de 1 e 2 tempos com resolução', focus: 'Sair e voltar ao groove exatamente no 1.',
    warmup: ['warm-paradiddle-8'], rudiments: ['para-toms', 'singles-toms', 'combo-singles-doubles'], speed: ['para-16-accent'], coordination: ['coord-rlkk', 'coord-ghost-groove'], subdivisions: ['accent-sextuplets-3'], application: ['fill-1beat', 'fill-2beat-toms', 'fill-sextuplet'] },
  // Fase 5 — Linguagem Gospel Chops
  { title: 'RLRLKK: o chop de seis', focus: 'O chop base, devagar e uniforme.',
    warmup: ['warm-singles-16-soft'], rudiments: ['gospel-rlrlkk', 'singles-sextuplets'], speed: ['singles-sextuplets'], coordination: ['coord-rlk'], subdivisions: ['accent-sextuplets-3'], application: ['gospel-groove-chop', 'gospel-rlrlkk-toms'] },
  { title: 'Chops a partir do paradiddle', focus: 'RLRRKK e a ligação com o paradiddle-diddle.',
    warmup: ['warm-paradiddle-8'], rudiments: ['gospel-rlrrkk', 'para-diddle', 'gospel-rlrlkk'], speed: ['gospel-rlrlkk'], coordination: ['coord-rlkk'], subdivisions: ['combo-groups-6'], application: ['gospel-groove-chop', 'fill-paradiddle-2beat'] },
  { title: 'Deslocamentos: começar fora do tempo', focus: 'Frases que começam no contratempo.',
    warmup: ['warm-singles-16-soft'], rudiments: ['gospel-lrlrkk', 'gospel-rlrlkk'], speed: ['singles-burst'], coordination: ['coord-rlk-toms'], subdivisions: ['accent-moving-16', 'accent-sextuplets-3'], application: ['gospel-displaced', 'gospel-groove-chop'] },
  { title: 'Groove ↔ fill sem perder o tempo', focus: 'Alternar groove e chop mantendo o pulso.',
    warmup: ['warm-hands-feet'], rudiments: ['gospel-rllk', 'gospel-rlrlkk'], speed: ['gospel-rlrlkk'], coordination: ['coord-ghost-groove'], subdivisions: ['singles-switch-3-6'], application: ['gospel-groove-chop', 'gospel-rlrlkk-toms', 'gospel-displaced'] },
  { title: 'Variações de um motivo', focus: 'Criar respostas musicais a partir de uma ideia.',
    warmup: ['warm-singles-16-soft'], rudiments: ['gospel-rlrlkk', 'gospel-lrlrkk', 'gospel-rlrrkk'], speed: ['singles-sextuplets'], coordination: ['coord-rlk-toms', 'coord-rlkk'], subdivisions: ['combo-groups-6'], application: ['gospel-motif', 'gospel-displaced'] },
  // Fase 6 — Integração e desempenho
  { title: 'Revisão dos rudimentos principais', focus: 'Singles, doubles e paradiddles no melhor nível.',
    warmup: ['warm-singles-8'], rudiments: ['singles-16', 'doubles-16', 'para-16-accent', 'para-inverted', 'singles-endurance'], speed: ['singles-burst'], coordination: ['coord-ghost-groove'], subdivisions: ['accent-moving-16'], application: ['phrase-2beat', 'fill-4beat-toms'] },
  { title: 'Sequências de viradas', focus: 'Encadear viradas de 1, 2 e 4 tempos.',
    warmup: ['warm-paradiddle-8'], rudiments: ['singles-sextuplets', 'gospel-rlrlkk'], speed: ['gospel-rlrlkk'], coordination: ['coord-rlk-toms'], subdivisions: ['singles-switch-3-6', 'singles-switch-8-16'], application: ['phrase-sequence', 'phrase-2beat'] },
  { title: 'Frases de 2 e 4 tempos', focus: 'Frases completas com começo, meio e resolução.',
    warmup: ['warm-hands-feet'], rudiments: ['para-toms', 'doubles-toms', 'gospel-rlrrkk'], speed: ['singles-sextuplets'], coordination: ['coord-rlkk'], subdivisions: ['accent-sextuplets-3'], application: ['phrase-sequence', 'gospel-motif'] },
  { title: 'Execução musical completa', focus: 'Tocar com liberdade, como numa música.',
    warmup: ['warm-singles-16-soft'], rudiments: ['gospel-rlrlkk', 'gospel-lrlrkk', 'singles-16'], speed: ['singles-burst'], coordination: ['coord-ghost-groove', 'coord-groove-16hh'], subdivisions: ['dynamics-ghost'], application: ['gospel-motif', 'phrase-sequence', 'gospel-rlrlkk-toms'] },
  { title: 'Avaliação final', focus: 'Repetir os testes do Dia 1 e ver a evolução real.', tests: true,
    warmup: ['warm-singles-8'], rudiments: refs, speed: ['singles-sextuplets'], coordination: ['coord-rlk-toms'], subdivisions: ['singles-switch-3-6'], application: ['phrase-sequence', 'gospel-groove-chop'] },
];

export function phaseOf(day: number): PhaseInfo {
  if (day > PROGRAM_DAYS) return PHASES[PHASES.length - 1];
  return PHASES[Math.min(PHASES.length, Math.ceil(day / 5)) - 1];
}

/**
 * Plano de um dia da sequência. Depois do Dia 30, o programa continua com ciclos
 * de consolidação que retomam os Dias 21–30 (linguagem + integração, com testes
 * no fim de cada ciclo). O número do dia organiza a sequência; não depende de datas.
 */
export function dayPlan(day: number): DayPlan {
  const n = Math.max(1, Math.floor(day));
  if (n <= PROGRAM_DAYS) {
    return { day: n, phase: phaseOf(n).id, ...DAYS[n - 1] };
  }
  const cycle = Math.floor((n - PROGRAM_DAYS - 1) / 10) + 1;
  const base = DAYS[20 + ((n - PROGRAM_DAYS - 1) % 10)];
  return { day: n, phase: 6, cycle, ...base, title: `Consolidação ${cycle} · ${base.title}` };
}

export const ALL_PROGRAM_DAYS: readonly DayPlan[] = Array.from({ length: PROGRAM_DAYS }, (_, i) => dayPlan(i + 1));
