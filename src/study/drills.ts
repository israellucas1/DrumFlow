/**
 * Catálogo de exercícios dos Planos de Estudo. Cada exercício tem um padrão rítmico
 * real (tocado pela grade e pelo metrônomo), objetivo, instruções, critério de
 * sucesso e prescrição de BPM. "Pad" = linha da caixa.
 */
import type { Exercise, InstrumentId, SubdivisionId } from '../music/types';
import { buildExercise, chopNotes, type NoteSpec } from '../data/builders';
import { LIBRARY } from '../data/rudiments';
import { cleanFloat } from '../music/beatMath';
import type { Drill, SkillId } from './types';

const E = 0.5;
const S = 0.25;
const T = 1 / 3;
const X = 1 / 6;

function pattern(id: string, name: string, subdivision: SubdivisionId, notes: NoteSpec[], totalBars = 1): Exercise {
  return buildExercise({
    id: `plan-${id}`,
    name,
    description: '',
    category: 'study',
    origin: 'library',
    bpm: 60,
    subdivision,
    totalBars,
    notes,
  });
}

const lib = (id: string): Exercise => {
  const ex = LIBRARY.find((e) => e.id === id);
  if (!ex) throw new Error(`Exercício da biblioteca ausente: ${id}`);
  return ex;
};

/**
 * Sequência de mãos (R/L, espaços ignorados) a partir de `start`, com instrumento,
 * acento e intensidade definidos por índice.
 */
function seq(
  sticking: string,
  o: {
    start?: number;
    step: number;
    inst?: (i: number) => InstrumentId;
    accent?: (i: number) => boolean;
    vel?: (i: number) => number | undefined;
  },
): NoteSpec[] {
  return sticking
    .replace(/\s+/g, '')
    .split('')
    .map((h, i) => ({
      at: cleanFloat((o.start ?? 0) + i * o.step),
      instrument: o.inst?.(i) ?? 'snare',
      limb: h === 'R' ? 'rightHand' : 'leftHand',
      accent: o.accent?.(i) ?? false,
      velocity: o.vel?.(i),
    }));
}

const rep = (s: string, n: number) => Array.from({ length: n }, () => s).join(' ');
const every = (n: number) => (i: number) => i % n === 0;
const TOMS: InstrumentId[] = ['snare', 'tom1', 'tom2', 'floorTom'];

/** Groove de referência em colcheias a partir de `start` (chimbal, caixa no 2/4, bumbo no 1/3). */
function groove(start: number, beats: number, crash = false): NoteSpec[] {
  const out: NoteSpec[] = [];
  for (let i = 0; i < beats * 2; i++) {
    const at = start + i * E;
    if (i === 0 && crash) out.push({ at, instrument: 'crash', limb: 'rightHand', accent: true });
    else out.push({ at, instrument: 'hiHat', limb: 'rightHand', accent: i % 2 === 0 });
  }
  for (let b = 0; b < beats; b++) {
    const beatInBar = Math.round(start + b) % 4;
    if (beatInBar % 2 === 1) out.push({ at: start + b, instrument: 'snare', limb: 'leftHand', accent: true });
    else out.push({ at: start + b, instrument: 'kick', limb: 'rightFoot' });
  }
  return out;
}

interface DrillText {
  goal: string;
  instructions: string[];
  success: string;
}

function drill(
  id: string,
  name: string,
  skill: SkillId,
  bpm: [number, number, number],
  p: Exercise,
  text: DrillText,
  test = false,
): Drill {
  return { id, name, skill, bpm: { start: bpm[0], target: bpm[1], step: bpm[2] }, pattern: { ...p, bpm: bpm[0] }, ...text, test };
}

const RELAX = 'Ombros soltos, pegada leve; o pulso faz o movimento, não o braço.';
const PAD = 'Pode ser no pad (linha da caixa) ou na caixa.';

export const DRILLS: readonly Drill[] = [
  // ───────── Aquecimento ─────────
  drill('warm-singles-8', 'Aquecimento: singles em colcheias', 'warmup', [60, 80, 4],
    pattern('warm-singles-8', 'Singles em colcheias', 'eighth', seq(rep('RL', 4), { step: E })), {
      goal: 'Acordar as mãos com movimentos amplos e iguais.',
      instructions: [PAD, 'Baquetas na mesma altura nas duas mãos.', RELAX],
      success: 'Som igual entre direita e esquerda, sem pressa.',
    }),
  drill('warm-doubles-8', 'Aquecimento: doubles em colcheias', 'warmup', [60, 80, 4],
    pattern('warm-doubles-8', 'Doubles em colcheias', 'eighth', seq(rep('RRLL', 2), { step: E })), {
      goal: 'Preparar o rebote de forma lenta e controlada.',
      instructions: [PAD, 'Dois movimentos de pulso por mão (sem "quicar" ainda).', RELAX],
      success: 'Os dois toques de cada mão com o mesmo volume.',
    }),
  drill('warm-paradiddle-8', 'Aquecimento: paradiddle em colcheias', 'warmup', [60, 80, 4],
    pattern('warm-paradiddle-8', 'Paradiddle em colcheias', 'eighth', seq('RLRR LRLL', { step: E })), {
      goal: 'Relembrar a sequência do paradiddle sem pressão de tempo.',
      instructions: [PAD, 'Fale a sequência: "pa-ra-di-dle".', RELAX],
      success: 'Sequência correta do início ao fim, sem hesitar.',
    }),
  drill('warm-hands-feet', 'Aquecimento: mãos e bumbo juntos', 'warmup', [70, 90, 5],
    pattern('warm-hands-feet', 'Mãos e bumbo', 'quarter', [
      ...seq('RLRL', { step: 1 }),
      ...[0, 1, 2, 3].map((at) => ({ at, instrument: 'kick' as const, limb: 'rightFoot' as const })),
    ]), {
      goal: 'Sincronizar mãos e pé desde o início do treino.',
      instructions: ['Caixa em semínimas alternadas + bumbo em todos os tempos.', 'Mão e pé devem soar como uma nota só.'],
      success: 'Nenhum "flam" entre mão e pé.',
    }),
  drill('warm-singles-16-soft', 'Aquecimento: singles leves em semicolcheias', 'warmup', [60, 90, 4],
    pattern('warm-singles-16-soft', 'Singles leves', 'sixteenth', seq(rep('RL', 8), { step: S, vel: () => 60 })), {
      goal: 'Aquecer com volume baixo e movimentos pequenos.',
      instructions: [PAD, 'Baquetas perto da pele (2–3 cm).', RELAX],
      success: 'Volume baixo e constante, sem tensão.',
    }),

  // ───────── Singles (trilha de memória muscular) ─────────
  drill('singles-8', 'Singles em colcheias', 'singles', [60, 120, 4],
    pattern('singles-8', 'Singles em colcheias', 'eighth', seq(rep('RL', 4), { step: E })), {
      goal: 'Regularidade: cada nota exatamente no lugar.',
      instructions: [PAD, 'Mesma altura de baqueta nas duas mãos.', 'Escute o clique "sumir" dentro da sua nota.'],
      success: 'Notas alinhadas com o clique e volume uniforme durante todo o bloco.',
    }),
  drill('singles-16', 'Singles em semicolcheias', 'singles', [60, 120, 4],
    pattern('singles-16', 'Singles em semicolcheias', 'sixteenth', seq(rep('RL', 8), { step: S })), {
      goal: 'Alternância contínua e espaçamento uniforme.',
      instructions: [PAD, 'Movimento só de pulso; antebraço acompanha.', RELAX],
      success: '4 notas iguais por tempo, sem a mão fraca "atrasar".',
    }),
  drill('singles-16-accent', 'Singles com acento a cada 4', 'singles', [60, 110, 4],
    pattern('singles-16-accent', 'Singles acentuados', 'sixteenth', seq(rep('RL', 8), { step: S, accent: every(4) })), {
      goal: 'Controlar dinâmica: acento alto, notas baixas realmente baixas.',
      instructions: ['Acento: baqueta alta. Notas normais: baqueta baixa.', 'Aqui o acento cai sempre na mão direita.'],
      success: 'Diferença clara entre acento e notas baixas.',
    }),
  drill('singles-triplets', 'Singles em tercinas', 'singles', [60, 110, 4],
    pattern('singles-triplets', 'Singles em tercinas', 'triplet', seq(rep('RLR LRL', 2), { step: T, accent: every(3) })), {
      goal: 'Tocar singles em grupos de três, com o acento trocando de mão.',
      instructions: [PAD, 'Conte "1-tri-ná, 2-tri-ná".', 'O acento cai na direita e depois na esquerda.'],
      success: 'Tercinas iguais (não "manquinhas") e acentos dos dois lados iguais.',
    }),
  drill('singles-sextuplets', 'Singles em sextinas', 'singles', [50, 90, 3],
    pattern('singles-sextuplets', 'Singles em sextinas', 'sextuplet', seq(rep('RLRLRL', 4), { step: X, accent: every(6) })), {
      goal: 'Preparar a velocidade das frases de gospel chops.',
      instructions: [PAD, 'Movimentos pequenos; não aumente a altura para "ajudar".', RELAX],
      success: '6 notas iguais por tempo, acento no início de cada grupo.',
    }),
  drill('singles-switch-8-16', 'Singles: colcheias ↔ semicolcheias', 'subdivisions', [60, 110, 4],
    pattern('singles-switch-8-16', 'Colcheias e semicolcheias', 'sixteenth', [
      ...seq(rep('RL', 4), { step: E }),
      ...seq(rep('RL', 8), { start: 4, step: S, accent: every(4) }),
    ], 2), {
      goal: 'Mudar de subdivisão sem mudar o pulso.',
      instructions: ['Compasso 1: colcheias. Compasso 2: semicolcheias.', 'O tempo (clique) não acelera quando as notas dobram.'],
      success: 'Troca limpa na barra de compasso, sem correr.',
    }),
  drill('singles-switch-3-6', 'Singles: tercinas ↔ sextinas', 'subdivisions', [50, 90, 3],
    pattern('singles-switch-3-6', 'Tercinas e sextinas', 'sextuplet', [
      ...seq(rep('RLR LRL', 2), { step: T, accent: every(3) }),
      ...seq(rep('RLRLRL', 4), { start: 4, step: X, accent: every(6) }),
    ], 2), {
      goal: 'Dobrar a densidade das notas mantendo o pulso estável.',
      instructions: ['Compasso 1: tercinas. Compasso 2: sextinas (o dobro).', 'Mantenha os acentos no tempo.'],
      success: 'Passagem sem pressa e sem atraso.',
    }),
  drill('singles-toms', 'Singles pelos tons', 'singles', [60, 110, 4],
    pattern('singles-toms', 'Singles pelos tons', 'sixteenth', seq(rep('RLRL', 4), { step: S, inst: (i) => TOMS[Math.floor(i / 4)], accent: every(4) })), {
      goal: 'Levar os singles para a bateria: caixa → tom 1 → tom 2 → surdo.',
      instructions: ['Um tempo em cada peça.', 'Os braços se movem; as mãos continuam iguais.'],
      success: 'Mesmo volume em todas as peças, sem atraso na troca.',
    }),
  drill('singles-dynamics', 'Singles em crescendo', 'accents', [60, 100, 4],
    pattern('singles-dynamics', 'Crescendo', 'sixteenth', seq(rep('RL', 16), { step: S, vel: (i) => Math.round(35 + (i / 31) * 85) }), 2), {
      goal: 'Controle de dinâmica: do muito suave ao forte, sem acelerar.',
      instructions: ['Comece com a baqueta quase encostada e suba a altura aos poucos.', 'Ao ficar forte, o tempo NÃO acelera.'],
      success: 'Crescendo gradual e tempo estável.',
    }),
  drill('singles-endurance', 'Singles: resistência', 'singles', [70, 130, 4],
    pattern('singles-endurance', 'Singles (resistência)', 'sixteenth', seq(rep('RL', 8), { step: S })), {
      goal: 'Sustentar singles por mais tempo sem perder qualidade.',
      instructions: ['Toque o bloco inteiro sem parar, num BPM confortável.', 'Sentiu tensão? Reduza 4 BPM e continue.'],
      success: 'Bloco inteiro com o mesmo som do início ao fim.',
    }),
  drill('singles-burst', 'Singles: rajadas de velocidade', 'singles', [80, 140, 4],
    pattern('singles-burst', 'Rajadas', 'sixteenth', seq(rep('RL', 8), { step: S, accent: every(4) })), {
      goal: 'Ganhar velocidade em intervalos curtos, com recuperação.',
      instructions: [
        'Alterne: 20 s no BPM atual + 8, depois 40 s no BPM atual (use os botões + e −).',
        'Pare na hora se o antebraço "travar".',
        RELAX,
      ],
      success: 'Rajadas limpas; nos trechos lentos, o controle volta totalmente.',
    }),

  // ───────── Doubles ─────────
  drill('doubles-8', 'Doubles em colcheias', 'doubles', [60, 110, 4],
    pattern('doubles-8', 'Doubles em colcheias', 'eighth', seq(rep('RRLL', 2), { step: E })), {
      goal: 'Dois toques por mão com volumes iguais.',
      instructions: [PAD, 'Toque os dois movimentos ativamente (ainda sem depender do rebote).'],
      success: 'Segundo toque tão forte quanto o primeiro.',
    }),
  drill('doubles-16', 'Doubles em semicolcheias', 'doubles', [60, 110, 4],
    pattern('doubles-16', 'Doubles em semicolcheias', 'sixteenth', seq(rep('RRLL', 4), { step: S })), {
      goal: 'Usar o rebote com controle.',
      instructions: [PAD, 'Primeiro toque com o pulso, segundo com os dedos/rebote.', RELAX],
      success: 'Rulo uniforme: não dá para ouvir onde a mão troca.',
    }),
  drill('doubles-accent-2nd', 'Doubles com acento no 2º toque', 'doubles', [55, 100, 4],
    pattern('doubles-accent-2nd', 'Doubles: 2º toque acentuado', 'sixteenth', seq(rep('RRLL', 4), { step: S, accent: (i) => i % 2 === 1 })), {
      goal: 'Fortalecer o segundo toque (o ponto fraco do double).',
      instructions: ['Acentue o segundo toque de cada mão.', 'Use os dedos para "puxar" o segundo toque.'],
      success: 'Segundo toque claramente mais forte, sem atrasar.',
    }),
  drill('doubles-toms', 'Doubles pelos tons', 'doubles', [60, 100, 4],
    pattern('doubles-toms', 'Doubles pelos tons', 'sixteenth', seq(rep('RRLL', 4), { step: S, inst: (i) => TOMS[Math.floor(i / 4)] })), {
      goal: 'Manter o rebote ao mudar de peça.',
      instructions: ['Um tempo em cada peça: caixa, tom 1, tom 2, surdo.', 'Os tons rebatem diferente: ajuste a pegada.'],
      success: 'Doubles iguais em todas as peças.',
    }),

  // ───────── Combinações ─────────
  drill('combo-singles-doubles', 'Singles + doubles', 'combinations', [60, 110, 4],
    pattern('combo-singles-doubles', 'Singles e doubles', 'sixteenth', seq(rep('RLRL RRLL', 2), { step: S, accent: every(4) })), {
      goal: 'Trocar entre toque simples e duplo sem mudar o som.',
      instructions: ['Um tempo de singles, um tempo de doubles.', 'A troca não pode "tropeçar".'],
      success: 'Os dois tempos soam iguais em volume e espaçamento.',
    }),
  drill('combo-groups-3', 'Grupos de três: RLL', 'combinations', [60, 100, 4],
    pattern('combo-groups-3', 'RLL em tercinas', 'triplet', seq(rep('RLL', 4), { step: T, accent: every(3) })), {
      goal: 'Agrupar notas de três em três (base para viradas em tercina).',
      instructions: ['Acento na direita, duas notas baixas na esquerda.', 'Esquerda com rebote controlado.'],
      success: 'Acentos regulares em todos os tempos.',
    }),
  drill('combo-groups-6', 'Grupos de seis: RLRLRR LRLRLL', 'combinations', [50, 90, 3],
    pattern('combo-groups-6', 'Double paradiddle em sextinas', 'sextuplet', seq(rep('RLRLRR LRLRLL', 2), { step: X, accent: every(6) })), {
      goal: 'Combinação de seis notas que alterna a mão inicial.',
      instructions: ['Cada grupo de 6 dura um tempo.', 'Acento no início de cada grupo.'],
      success: 'Sequência correta e acentos alinhados com o clique.',
    }),

  // ───────── Paradiddles ─────────
  drill('para-8', 'Paradiddle em colcheias', 'paradiddle', [60, 100, 4],
    pattern('para-8', 'Paradiddle em colcheias', 'eighth', seq('RLRR LRLL', { step: E })), {
      goal: 'Aprender o paradiddle devagar e sem erros.',
      instructions: [PAD, 'Diga "pa-ra-di-dle" enquanto toca.'],
      success: 'Nenhum erro de mão durante o bloco.',
    }),
  drill('para-16', 'Paradiddle em semicolcheias', 'paradiddle', [60, 110, 4],
    pattern('para-16', 'Paradiddle', 'sixteenth', seq(rep('RLRR LRLL', 2), { step: S })), {
      goal: 'Paradiddle fluido no metrônomo.',
      instructions: [PAD, 'O "diddle" (duplo) não pode acelerar.'],
      success: '4 notas iguais por tempo, sem pressa no duplo.',
    }),
  drill('para-16-accent', 'Paradiddle acentuado', 'paradiddle', [60, 110, 4],
    pattern('para-16-accent', 'Paradiddle acentuado', 'sixteenth', seq(rep('RLRR LRLL', 2), { step: S, accent: every(4) })), {
      goal: 'Acento na primeira nota de cada grupo, notas baixas controladas.',
      instructions: ['Acento = baqueta alta; resto = baqueta baixa.', 'Acento alterna de mão a cada grupo.'],
      success: 'Acentos iguais nas duas mãos.',
    }),
  drill('para-accent-moved', 'Paradiddle com acento deslocado', 'accents', [55, 100, 4],
    pattern('para-accent-moved', 'Paradiddle: acento na 2ª nota', 'sixteenth', seq(rep('RLRR LRLL', 2), { step: S, accent: (i) => i % 4 === 1 })), {
      goal: 'Acentuar uma posição diferente do tempo (independência do acento).',
      instructions: ['O acento cai na 2ª nota de cada grupo ("e").', 'Mantenha a sequência de mãos correta.'],
      success: 'Acento sempre no "e", sem mudar o tempo.',
    }),
  drill('para-inverted', 'Paradiddle invertido (RLLR LRRL)', 'paradiddle', [55, 100, 4],
    pattern('para-inverted', 'Paradiddle invertido', 'sixteenth', seq(rep('RLLR LRRL', 2), { step: S, accent: every(4) })), {
      goal: 'Inverter a posição do duplo (muito usado em viradas).',
      instructions: ['O duplo fica no meio do grupo.', 'Acento na primeira nota.'],
      success: 'Sequência correta e duplo uniforme.',
    }),
  drill('para-plus-singles', 'Paradiddle + singles', 'combinations', [60, 100, 4],
    pattern('para-plus-singles', 'Paradiddle + singles', 'sixteenth', seq('RLRR LRLL RLRL RLRL', { step: S, accent: every(4) })), {
      goal: 'Combinar paradiddle e singles numa frase.',
      instructions: ['Dois tempos de paradiddle, dois de singles.'],
      success: 'Transição sem pausa entre as partes.',
    }),
  drill('para-toms', 'Paradiddle com acentos nos tons', 'paradiddle', [60, 100, 4],
    pattern('para-toms', 'Paradiddle nos tons', 'sixteenth', seq(rep('RLRR LRLL', 2), {
      step: S,
      accent: every(4),
      inst: (i) => (i % 4 === 0 ? (i % 8 === 0 ? 'floorTom' : 'tom1') : 'snare'),
    })), {
      goal: 'Distribuir o rudimento pela bateria: acentos nos tons, resto na caixa.',
      instructions: ['Mão direita acentua no surdo, esquerda no tom 1.', 'Notas baixas sempre na caixa.'],
      success: 'Melodia clara entre tons e caixa.',
    }),
  drill('para-groove', 'Groove de paradiddle', 'coordination', [60, 100, 4],
    pattern('para-groove', 'Groove de paradiddle', 'sixteenth', [
      ...seq(rep('RLRR LRLL', 2), {
        step: S,
        inst: (i) => ('RLRRLRLL'[i % 8] === 'R' ? 'hiHat' : 'snare'),
        accent: (i) => i === 4 || i === 12,
        vel: (i) => ('RLRRLRLL'[i % 8] === 'L' && i !== 4 && i !== 12 ? 45 : undefined),
      }),
      { at: 0, instrument: 'kick', limb: 'rightFoot' },
      { at: 2, instrument: 'kick', limb: 'rightFoot' },
    ]), {
      goal: 'Transformar o paradiddle em groove: direita no chimbal, esquerda na caixa.',
      instructions: ['Esquerda faz ghost notes, com acento no 2 e no 4.', 'Bumbo no 1 e no 3.'],
      success: 'Groove estável com backbeat claro.',
    }),
  drill('para-diddle', 'Paradiddle-diddle (RLRRLL)', 'paradiddle', [60, 100, 4],
    pattern('para-diddle', 'Paradiddle-diddle', 'triplet', seq(rep('RLRRLL', 2), { step: T, accent: every(6) })), {
      goal: 'Rudimento de seis notas, base de vários chops.',
      instructions: ['Em tercinas: um grupo dura dois tempos.', 'Não alterna a mão inicial.'],
      success: 'Duplos uniformes e acento no início.',
    }),

  // ───────── Acentos e subdivisões ─────────
  drill('accent-moving-16', 'Acento caminhando', 'accents', [60, 100, 4],
    pattern('accent-moving-16', 'Acento caminhando', 'sixteenth', seq(rep('RL', 8), { step: S, accent: (i) => i === 0 || i === 5 || i === 10 || i === 15 })), {
      goal: 'Acentuar cada posição da semicolcheia (1, e, &, a).',
      instructions: ['Tempo 1: acento na 1ª nota; tempo 2: na 2ª; tempo 3: na 3ª; tempo 4: na 4ª.'],
      success: 'Acento no lugar certo em cada tempo, sem mudar o andamento.',
    }),
  drill('accent-triplets', 'Acentos de 2 sobre tercinas', 'accents', [60, 100, 4],
    pattern('accent-triplets', 'Acentos sobre tercinas', 'triplet', seq(rep('RLR LRL', 2), { step: T, accent: (i) => i % 2 === 0 })), {
      goal: 'Sensação de "2 contra 3": acentos a cada duas notas sobre tercinas.',
      instructions: ['Acento em uma nota sim, outra não.', 'Ouça o pulso das tercinas por baixo.'],
      success: 'Acentos regulares sem perder o grupo de três.',
    }),
  drill('accent-sextuplets-3', 'Sextinas com acento a cada 3', 'accents', [50, 90, 3],
    pattern('accent-sextuplets-3', 'Sextinas acentuadas', 'sextuplet', seq(rep('RLRLRL', 4), { step: X, accent: every(3) })), {
      goal: 'Ouvir as sextinas como dois grupos de três.',
      instructions: ['Acento na 1ª e na 4ª nota de cada tempo.', 'Os acentos trocam de mão.'],
      success: 'Acentos iguais e no lugar certo.',
    }),
  drill('dynamics-ghost', 'Acentos e ghost notes', 'accents', [60, 100, 4],
    pattern('dynamics-ghost', 'Acentos e ghost notes', 'sixteenth', seq(rep('RL', 8), { step: S, accent: every(4), vel: (i) => (i % 4 === 0 ? undefined : 40) })), {
      goal: 'Contraste máximo: acentos fortes e notas fantasma bem baixas.',
      instructions: ['Ghost notes a 1–2 cm da pele.', 'Depois do acento, a baqueta para baixa (stop stroke).'],
      success: 'Dá para ouvir dois volumes bem diferentes.',
    }),

  // ───────── Coordenação ─────────
  drill('coord-groove-rock', 'Groove básico', 'coordination', [70, 110, 5],
    pattern('coord-groove-rock', 'Groove básico', 'eighth', [
      ...groove(0, 4),
      { at: 2.5, instrument: 'kick', limb: 'rightFoot' },
    ]), {
      goal: 'Levar o pulso para a bateria inteira.',
      instructions: ['Chimbal em colcheias, caixa no 2 e 4, bumbo no 1, 3 e "e" do 3.'],
      success: 'Groove estável, caixa sempre no mesmo volume.',
    }),
  drill('coord-groove-16hh', 'Groove com chimbal em semicolcheias', 'coordination', [60, 100, 4],
    pattern('coord-groove-16hh', 'Groove em semicolcheias', 'sixteenth', [
      ...seq(rep('RL', 8), {
        step: S,
        inst: (i) => (i === 4 || i === 12 ? 'snare' : 'hiHat'),
        accent: (i) => i === 4 || i === 12 || i % 4 === 0,
      }),
      { at: 0, instrument: 'kick', limb: 'rightFoot' },
      { at: 2.5, instrument: 'kick', limb: 'rightFoot' },
    ]), {
      goal: 'Groove com as duas mãos no chimbal (muito comum no gospel).',
      instructions: ['Mãos alternadas no chimbal; a direita vai para a caixa no 2 e no 4.'],
      success: 'Chimbal contínuo e caixa no lugar.',
    }),
  drill('coord-ghost-groove', 'Groove gospel com ghost notes', 'coordination', [70, 100, 4], lib('lib-gospel-ghost-groove'), {
    goal: 'Variações de caixa dentro do groove (ghost notes).',
    instructions: ['Ghost notes bem baixas; backbeat forte.', 'O chimbal não pode mudar de volume.'],
    success: 'Ghosts audíveis mas discretas, backbeat firme.',
  }),
  drill('coord-hands-pedal', 'Mãos + bumbo + pedal do chimbal', 'coordination', [60, 100, 4],
    pattern('coord-hands-pedal', 'Mãos e pés', 'eighth', [
      ...seq(rep('RL', 4), { step: E }),
      { at: 0, instrument: 'kick', limb: 'rightFoot' },
      { at: 2, instrument: 'kick', limb: 'rightFoot' },
      { at: 1, instrument: 'pedalHiHat', limb: 'leftFoot' },
      { at: 3, instrument: 'pedalHiHat', limb: 'leftFoot' },
    ]), {
      goal: 'Independência: os dois pés marcando enquanto as mãos tocam singles.',
      instructions: ['Bumbo no 1 e 3, pedal do chimbal no 2 e 4.'],
      success: 'Pés firmes sem atrapalhar a alternância das mãos.',
    }),
  drill('coord-singles-kick', 'Singles com bumbo nos tempos', 'coordination', [60, 100, 4],
    pattern('coord-singles-kick', 'Singles + bumbo', 'sixteenth', [
      ...seq(rep('RL', 8), { step: S, accent: every(4) }),
      ...[0, 1, 2, 3].map((at) => ({ at, instrument: 'kick' as const, limb: 'rightFoot' as const })),
    ]), {
      goal: 'Bumbo junto com a mão direita a cada tempo.',
      instructions: ['O bumbo cai junto com o acento da direita.'],
      success: 'Mão e pé exatamente juntos.',
    }),
  drill('coord-rlk', 'RLK em sextinas', 'gospel', [55, 90, 3], lib('lib-gospel-rlk'), {
    goal: 'Primeiro passo do linear mão-mão-pé.',
    instructions: ['Bumbo com o mesmo volume das mãos.', 'Comece bem devagar.'],
    success: 'Três notas iguais, nenhuma "engolida".',
  }),
  drill('coord-rlkk', 'RLKK linear', 'gospel', [60, 100, 4], lib('lib-gospel-rlkk'), {
    goal: 'Dois bumbos seguidos dentro da frase.',
    instructions: ['Bumbos com o calcanhar levemente levantado.', 'Nada soa junto: é linear.'],
    success: 'Quatro notas iguais por tempo.',
  }),
  drill('coord-rlk-toms', 'RLK entre surdo e caixa', 'gospel', [60, 95, 3], lib('lib-gospel-rlk-toms'), {
    goal: 'Levar o RLK para a bateria com som cheio.',
    instructions: ['Direita no surdo, esquerda na caixa.'],
    success: 'Frase contínua sem buracos.',
  }),

  // ───────── Aplicação: viradas com retorno ao groove ─────────
  drill('fill-1beat', 'Virada de 1 tempo (singles)', 'fills', [60, 100, 4],
    pattern('fill-1beat', 'Virada de 1 tempo', 'sixteenth', [
      ...groove(0, 4, true),
      ...groove(4, 3),
      ...seq('RLRL', { start: 7, step: S, accent: every(4) }),
    ], 2), {
      goal: 'Primeira virada: 1 tempo de singles e volta ao groove com crash.',
      instructions: ['Compasso 1: groove. Compasso 2: groove + virada no 4º tempo.', 'O crash do loop marca a resolução.'],
      success: 'Crash exatamente no tempo 1 após a virada.',
    }),
  drill('fill-2beat-toms', 'Virada de 2 tempos pelos tons', 'fills', [60, 100, 4],
    pattern('fill-2beat-toms', 'Virada de 2 tempos', 'sixteenth', [
      ...groove(0, 4, true),
      ...groove(4, 2),
      ...seq('RLRL RLRL', { start: 6, step: S, inst: (i) => TOMS[Math.floor(i / 2)], accent: every(4) }),
    ], 2), {
      goal: 'Virada de 2 tempos descendo os tons e resolvendo no groove.',
      instructions: ['Duas notas em cada peça: caixa, tom 1, tom 2, surdo.'],
      success: 'Volta ao groove sem atrasar.',
    }),
  drill('fill-4beat-toms', 'Virada de 4 tempos pelos tons', 'fills', [60, 100, 4],
    pattern('fill-4beat-toms', 'Virada de 4 tempos', 'sixteenth', [
      ...groove(0, 4, true),
      ...seq(rep('RLRL', 4), { start: 4, step: S, inst: (i) => TOMS[Math.floor(i / 4)], accent: every(4) }),
    ], 2), {
      goal: 'Virada de compasso inteiro mantendo a contagem.',
      instructions: ['Conte em voz alta durante a virada.'],
      success: 'Crash no 1 depois da virada, sem perder o tempo.',
    }),
  drill('fill-doubles-2beat', 'Virada de doubles (2 tempos)', 'fills', [60, 95, 4],
    pattern('fill-doubles-2beat', 'Virada de doubles', 'sixteenth', [
      ...groove(0, 4, true),
      ...groove(4, 2),
      ...seq('RRLL RRLL', { start: 6, step: S, inst: (i) => (i < 4 ? 'snare' : 'floorTom'), accent: every(4) }),
    ], 2), {
      goal: 'Aplicar doubles numa virada.',
      instructions: ['Tempo 3 na caixa, tempo 4 no surdo.'],
      success: 'Doubles iguais também no surdo.',
    }),
  drill('fill-paradiddle-2beat', 'Virada de paradiddle (2 tempos)', 'fills', [60, 95, 4],
    pattern('fill-paradiddle-2beat', 'Virada de paradiddle', 'sixteenth', [
      ...groove(0, 4, true),
      ...groove(4, 2),
      ...seq('RLRR LRLL', { start: 6, step: S, accent: every(4), inst: (i) => (i === 0 ? 'tom1' : i === 4 ? 'floorTom' : 'snare') }),
    ], 2), {
      goal: 'Paradiddle como virada, com acentos nos tons.',
      instructions: ['Acentos nos tons, notas baixas na caixa.'],
      success: 'Frase musical e volta limpa ao groove.',
    }),
  drill('fill-triplet', 'Virada em tercinas (2 tempos)', 'fills', [60, 100, 4],
    pattern('fill-triplet', 'Virada em tercinas', 'sextuplet', [
      ...groove(0, 4, true),
      ...groove(4, 2),
      ...seq('RLR LRL', { start: 6, step: T, inst: (i) => (['snare', 'snare', 'snare', 'tom1', 'tom2', 'floorTom'] as InstrumentId[])[i], accent: every(3) }),
    ], 2), {
      goal: 'Mudar de colcheias para tercinas dentro da virada.',
      instructions: ['Tempo 3: tercinas na caixa. Tempo 4: tom 1, tom 2, surdo.'],
      success: 'Tercinas iguais e volta no tempo.',
    }),
  drill('fill-sextuplet', 'Virada em sextinas (1 tempo)', 'fills', [55, 90, 3],
    pattern('fill-sextuplet', 'Virada em sextinas', 'sextuplet', [
      ...groove(0, 4, true),
      ...groove(4, 3),
      ...seq('RLRLRL', { start: 7, step: X, inst: (i) => TOMS[Math.min(3, Math.floor(i / 1.5))], accent: every(6) }),
    ], 2), {
      goal: 'Virada curta e rápida em sextinas descendo os tons.',
      instructions: ['Seis notas no último tempo.'],
      success: 'Seis notas iguais e crash no 1.',
    }),

  // ───────── Gospel chops ─────────
  drill('gospel-rlrlkk', 'RLRLKK (seis notas)', 'gospel', [55, 90, 3], lib('lib-gospel-rlrlkk'), {
    goal: 'O chop base: quatro singles e dois bumbos.',
    instructions: ['Mãos e pés com o mesmo volume.', 'Comece lento; velocidade vem depois.'],
    success: 'Grupo de seis uniforme em todos os tempos.',
  }),
  drill('gospel-rlrlkk-toms', 'RLRLKK descendo os tons', 'gospel', [55, 90, 3], lib('lib-gospel-rlrlkk-toms'), {
    goal: 'Aplicar o chop numa virada de compasso inteiro.',
    instructions: ['Groove → chop pelos tons → crash.'],
    success: 'Volta ao groove exatamente no 1.',
  }),
  drill('gospel-rlrrkk', 'RLRRKK', 'gospel', [55, 90, 3], lib('lib-gospel-rlrrkk'), {
    goal: 'Chop derivado do paradiddle-diddle.',
    instructions: ['O duplo da direita deve ser tão claro quanto os singles.'],
    success: 'Sequência correta e uniforme.',
  }),
  drill('gospel-lrlrkk', 'LRLRKK', 'gospel', [55, 90, 3], lib('lib-gospel-lrlrkk'), {
    goal: 'Mesma frase puxada pela esquerda (equilíbrio das mãos).',
    instructions: ['A esquerda lidera: atenção ao primeiro acento.'],
    success: 'Soa igual ao RLRLKK.',
  }),
  drill('gospel-rllk', 'RLLK linear', 'gospel', [60, 95, 4], lib('lib-gospel-rllk'), {
    goal: 'Rebote da esquerda dentro de uma frase linear.',
    instructions: ['Direita acentuada no tom; esquerda dupla na caixa.'],
    success: 'Duplo da esquerda limpo.',
  }),
  drill('gospel-groove-chop', 'Groove + chop no 4º tempo', 'gospel', [55, 90, 3], lib('lib-gospel-groove-chop'), {
    goal: 'Entrar e sair do chop sem perder o pulso.',
    instructions: ['Três tempos de groove, chop no quarto.'],
    success: 'O groove volta exatamente no 1.',
  }),
  drill('gospel-displaced', 'Chop começando no contratempo', 'gospel', [55, 90, 3],
    pattern('gospel-displaced', 'Chop deslocado', 'sextuplet', [
      ...groove(0, 2, true),
      { at: 2, instrument: 'kick', limb: 'rightFoot' },
      ...chopNotes('RLK', { start: 2.5, step: X, repeat: 3, accentFirst: true }),
    ]), {
      goal: 'Frase que começa numa subdivisão diferente (o "e" do 3).',
      instructions: ['Groove nos tempos 1 e 2; RLK ×3 começa no contratempo do 3.', 'Conte "3 E" antes de entrar.'],
      success: 'Entrada exata no contratempo e volta no 1.',
    }),
  drill('gospel-motif', 'Variações de um motivo', 'gospel', [55, 85, 3],
    pattern('gospel-motif', 'Motivo e variações', 'sextuplet', [
      ...groove(0, 4, true),
      ...groove(4, 3),
      ...chopNotes('RLRLKK', { start: 7, step: X, accentFirst: true }),
      ...groove(8, 4),
      ...groove(12, 3),
      ...chopNotes('RLRLKK', { start: 15, step: X, accentFirst: true }).map((n, i) =>
        n.instrument === 'kick' ? n : { ...n, instrument: (i < 2 ? 'tom1' : 'floorTom') as InstrumentId },
      ),
    ], 4), {
      goal: 'Criar variação a partir do mesmo motivo (caixa → tons).',
      instructions: ['Compasso 2: chop na caixa. Compasso 4: o mesmo chop nos tons.', 'Depois, invente sua própria variação no editor.'],
      success: 'As duas versões soam como pergunta e resposta.',
    }),
  drill('phrase-2beat', 'Frase de 2 tempos: tercina + chop', 'gospel', [55, 85, 3],
    pattern('phrase-2beat', 'Frase de 2 tempos', 'sextuplet', [
      ...groove(0, 4, true),
      ...groove(4, 2),
      ...seq('RLR', { start: 6, step: T, accent: every(3) }),
      ...chopNotes('RLRLKK', { start: 7, step: X, instruments: 'tom1', accentFirst: true }),
    ], 2), {
      goal: 'Combinar subdivisões numa mesma frase (tercina → sextina).',
      instructions: ['Tempo 3: tercina na caixa. Tempo 4: RLRLKK no tom.'],
      success: 'Mudança de densidade sem acelerar.',
    }),
  drill('phrase-sequence', 'Sequência de viradas (4 compassos)', 'gospel', [55, 85, 3],
    pattern('phrase-sequence', 'Sequência de viradas', 'sextuplet', [
      ...groove(0, 3, true),
      ...seq('RLR', { start: 3, step: T, inst: () => 'tom1', accent: every(3) }),
      ...groove(4, 2),
      ...chopNotes('RLRLKK', { start: 6, step: X, repeat: 2, instruments: ['snare', 'floorTom'], accentFirst: true }),
      ...groove(8, 4),
      ...chopNotes('RLRLKK', { start: 12, step: X, repeat: 4, instruments: TOMS, accentFirst: true }),
    ], 4), {
      goal: 'Encadear viradas de 1, 2 e 4 tempos com subdivisões diferentes.',
      instructions: ['C1: tercina no tom. C2: 2 tempos de chop. C3: groove. C4: chop pelos tons.'],
      success: 'Todas as voltas ao groove no tempo certo.',
    }),

  // ───────── Testes de referência (Dias 1, 15 e 30) ─────────
  drill('ref-singles', 'Teste: singles', 'test', [60, 140, 4],
    pattern('ref-singles', 'Teste de singles', 'sixteenth', seq(rep('RL', 8), { step: S, accent: every(4) })), {
      goal: 'Medir o maior andamento em que você toca singles com controle.',
      instructions: ['Suba o BPM aos poucos (+4).', 'Pare no último andamento tocado limpo por 20–30 s.', 'Anote esse BPM ao terminar.'],
      success: 'Registrar o BPM máximo controlado (não o máximo "sujo").',
    }, true),
  drill('ref-doubles', 'Teste: doubles', 'test', [60, 130, 4],
    pattern('ref-doubles', 'Teste de doubles', 'sixteenth', seq(rep('RRLL', 4), { step: S })), {
      goal: 'Medir o maior andamento controlado de doubles.',
      instructions: ['Mesmo procedimento: suba aos poucos e anote o último BPM limpo.'],
      success: 'Registrar o BPM máximo controlado.',
    }, true),
  drill('ref-paradiddle', 'Teste: paradiddle', 'test', [60, 130, 4],
    pattern('ref-paradiddle', 'Teste de paradiddle', 'sixteenth', seq(rep('RLRR LRLL', 2), { step: S, accent: every(4) })), {
      goal: 'Medir o maior andamento controlado do paradiddle.',
      instructions: ['Acentos claros também no andamento máximo.'],
      success: 'Registrar o BPM máximo controlado.',
    }, true),
  drill('ref-chop', 'Teste: RLRLKK', 'test', [50, 100, 3],
    pattern('ref-chop', 'Teste de RLRLKK', 'sextuplet', chopNotes('RLRLKK', { step: X, repeat: 4, accentFirst: true })), {
      goal: 'Medir o maior andamento controlado do chop de seis notas.',
      instructions: ['Bumbos com o mesmo volume das mãos no andamento máximo.'],
      success: 'Registrar o BPM máximo controlado.',
    }, true),
];

export const DRILL_BY_ID: Record<string, Drill> = Object.fromEntries(DRILLS.map((d) => [d.id, d]));
export const REF_DRILLS = ['ref-singles', 'ref-doubles', 'ref-paradiddle', 'ref-chop'] as const;

export const SKILL_LABELS: Record<SkillId, string> = {
  warmup: 'Aquecimento',
  singles: 'Singles',
  doubles: 'Doubles',
  combinations: 'Combinações',
  paradiddle: 'Paradiddles',
  accents: 'Acentos e dinâmica',
  subdivisions: 'Subdivisões',
  coordination: 'Coordenação',
  fills: 'Viradas',
  gospel: 'Gospel chops',
  test: 'Testes de referência',
};
