import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Exercise } from '../../music/types';
import { engrave, stickingLetter, TPQ, type EBar, type ENote, type ERest, type Voice } from '../../music/notation';
import { STEPS_PER_QUARTER } from '../../music/beatMath';
import { barLengthInQuarters } from '../../music/timeSignature';
import { useServices } from '../../app/AppState';

// ───────────── Geometria ─────────────
const SP = 9; // espaço entre linhas da pauta
const H = SP / 2; // um passo diatônico
const TOP = 66; // área acima da pauta (sequência de mãos, acentos, barras das mãos)
const STAFF_H = SP * 4;
const BOTTOM = 52; // área abaixo (barras dos pés)
const SYS_H = TOP + STAFF_H + BOTTOM;
const SYS_GAP = 6;
const CLEF_W = 30;
const TIME_W = 24;
const PAD = 16; // margem interna de cada compasso
const STEP_PX = 20; // largura natural por passo da subdivisão
const STEM = 30;
const HEAD_DX = 4.6; // ponto de encaixe da haste na cabeça da nota

interface BarLayout {
  bar: EBar;
  line: number;
  x: number;
  w: number;
}

function layoutBars(bars: EBar[], naturalW: number, width: number): { bars: BarLayout[]; lines: number; lineEnds: number[] } {
  const out: BarLayout[] = [];
  const lines: EBar[][] = [[]];
  let used = 0;
  bars.forEach((b) => {
    const prefix = CLEF_W + (lines.length === 1 ? TIME_W : 0);
    if (lines[lines.length - 1].length > 0 && prefix + used + naturalW > width) {
      lines.push([]);
      used = 0;
    }
    lines[lines.length - 1].push(b);
    used += naturalW;
  });
  const lineEnds: number[] = [];
  lines.forEach((lineBars, li) => {
    const prefix = CLEF_W + (li === 0 ? TIME_W : 0);
    const natural = lineBars.length * naturalW;
    const avail = Math.max(120, width - prefix - 2);
    const isLast = li === lines.length - 1;
    let k = avail / natural;
    if (isLast && lines.length > 1) k = Math.min(k, 1.15);
    k = Math.max(0.55, isLast && lines.length === 1 ? Math.min(k, 1.6) : k);
    let x = prefix;
    for (const bar of lineBars) {
      const w = naturalW * k;
      out.push({ bar, line: li, x, w });
      x += w;
    }
    lineEnds.push(x);
  });
  return { bars: out, lines: lines.length, lineEnds };
}

// ───────────── Primitivas ─────────────

const staffBottom = (line: number) => line * (SYS_H + SYS_GAP) + TOP + STAFF_H;
const stepY = (line: number, step: number) => staffBottom(line) - step * H;

function Head({ x, y, kind, small = false }: { x: number; y: number; kind: 'normal' | 'x'; small?: boolean }) {
  const s = small ? 0.62 : 1;
  if (kind === 'x') {
    const r = 3.8 * s;
    return (
      <g stroke="currentColor" strokeWidth={1.7 * s} strokeLinecap="round">
        <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} />
        <line x1={x - r} y1={y + r} x2={x + r} y2={y - r} />
      </g>
    );
  }
  return <ellipse cx={x} cy={y} rx={5 * s} ry={3.6 * s} transform={`rotate(-20 ${x} ${y})`} fill="currentColor" />;
}

function Rest({ x, y, beams, dots }: { x: number; y: number; beams: number; dots: number }) {
  const parts: ReactNode[] = [];
  if (beams === 0) {
    parts.push(
      <path
        key="q"
        d={`M${x - 2},${y - 11} L${x + 3},${y - 5} L${x - 2},${y + 1} L${x + 3},${y + 6} Q${x - 5},${y + 4} ${x + 1},${y + 12}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        strokeLinejoin="round"
        strokeLinecap="round"
      />,
    );
  } else {
    for (let k = 0; k < beams; k++) parts.push(<circle key={`c${k}`} cx={x - 2 - k * 1.5} cy={y - 4 + k * 6} r={2.2} fill="currentColor" />);
    parts.push(<line key="s" x1={x + 3.5} y1={y - 6} x2={x - 1 - beams} y2={y + 8 + (beams - 1) * 5} stroke="currentColor" strokeWidth={1.4} />);
  }
  if (dots) parts.push(<circle key="d" cx={x + 8} cy={y - 2} r={1.6} fill="currentColor" />);
  return <g>{parts}</g>;
}

function Accent({ x, y }: { x: number; y: number }) {
  return <polyline points={`${x - 4.5},${y - 3} ${x + 4.5},${y} ${x - 4.5},${y + 3}`} fill="none" stroke="currentColor" strokeWidth={1.5} />;
}

// ───────────── Componente ─────────────

export function StaffView({ exercise, showSticking = true }: { exercise: Exercise; showSticking?: boolean }) {
  const { transport } = useServices();
  const wrapRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<SVGLineElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const engraved = useMemo(() => engrave(exercise), [exercise]);
  const barTicks = Math.round(barLengthInQuarters(exercise.tempoSignature) * TPQ);
  const spq = STEPS_PER_QUARTER[exercise.subdivision];
  const naturalW = Math.max(150, (barTicks / TPQ) * spq * STEP_PX + 2 * PAD);
  // clientWidth inclui o padding do contêiner (px-1): desconta para não gerar rolagem à toa.
  const inner = width - 12;
  const layout = useMemo(() => layoutBars(engraved.bars, naturalW, Math.max(260, inner)), [engraved, naturalW, inner]);
  const svgW = Math.max(inner, ...layout.lineEnds.map((e) => e + 2));
  // Sem pés (haste para baixo), a margem inferior do último sistema pode ser bem menor.
  const svgH = layout.lines * (SYS_H + SYS_GAP) - (engraved.voices.includes('down') ? 0 : BOTTOM - 18);

  // Cursor + destaque da nota tocada, a partir do relógio de áudio (sem re-render).
  useEffect(() => {
    const svg = svgRef.current;
    const cursor = cursorRef.current;
    if (!svg || !cursor) return;
    const notes = Array.from(svg.querySelectorAll<SVGGElement>('[data-abs]')).map((el) => ({ el, abs: Number(el.dataset.abs) }));
    const barLen = barTicks / TPQ;
    let raf = 0;
    let lastActive = new Set<SVGGElement>();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const snap = transport.getSnapshot();
      const pos = snap.exerciseId === exercise.id ? transport.getPosition() : null;
      if (!pos || pos.state === 'stopped' || pos.isCountIn) {
        cursor.style.opacity = pos?.isCountIn ? '0.5' : '0';
        if (pos?.isCountIn) {
          const b = layout.bars[0];
          cursor.setAttribute('x1', String(b.x + PAD));
          cursor.setAttribute('x2', String(b.x + PAD));
          cursor.setAttribute('y1', String(stepY(0, 12)));
          cursor.setAttribute('y2', String(stepY(0, -4)));
        }
        lastActive.forEach((el) => delete el.dataset.play);
        lastActive = new Set();
        return;
      }
      const local = pos.localQuarter;
      const bi = Math.min(Math.floor(local / barLen + 1e-9), layout.bars.length - 1);
      const b = layout.bars[bi];
      const frac = (local - bi * barLen) / barLen;
      const x = b.x + PAD + frac * (b.w - 2 * PAD);
      cursor.style.opacity = pos.state === 'paused' ? '0.5' : '1';
      cursor.setAttribute('x1', String(x));
      cursor.setAttribute('x2', String(x));
      cursor.setAttribute('y1', String(stepY(b.line, 12)));
      cursor.setAttribute('y2', String(stepY(b.line, -4)));
      const win = (0.13 * snap.bpm) / 60;
      const now = new Set<SVGGElement>();
      if (pos.state === 'playing') for (const n of notes) if (local - n.abs >= -1e-4 && local - n.abs < win) now.add(n.el);
      lastActive.forEach((el) => !now.has(el) && delete el.dataset.play);
      now.forEach((el) => (el.dataset.play = 'active'));
      lastActive = now;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [transport, exercise.id, layout, barTicks]);

  const ts = exercise.tempoSignature;

  return (
    <div ref={wrapRef} className="overflow-x-auto rounded-xl border border-line bg-panel px-1 py-2">
      {width > 0 && (
        <svg ref={svgRef} width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="staff text-fg" role="img" aria-label={`Partitura de ${exercise.name}`}>
          {/* Pautas, claves, fórmula de compasso */}
          {Array.from({ length: layout.lines }, (_, li) => (
            <g key={`l${li}`}>
              {[0, 2, 4, 6, 8].map((s) => (
                <line key={s} x1={4} x2={layout.lineEnds[li]} y1={stepY(li, s)} y2={stepY(li, s)} stroke="currentColor" strokeOpacity={0.55} strokeWidth={1} />
              ))}
              <rect x={10} y={stepY(li, 6)} width={3.2} height={4 * H} fill="currentColor" />
              <rect x={16} y={stepY(li, 6)} width={3.2} height={4 * H} fill="currentColor" />
              {li === 0 && (
                <g fontFamily="Georgia, 'Times New Roman', serif" fontWeight={700} fontSize={19} textAnchor="middle" fill="currentColor">
                  <text x={CLEF_W + TIME_W / 2 - 2} y={stepY(0, 4) - 1.5}>
                    {ts.numerator}
                  </text>
                  <text x={CLEF_W + TIME_W / 2 - 2} y={stepY(0, 0) - 1.5}>
                    {ts.denominator}
                  </text>
                </g>
              )}
            </g>
          ))}

          {layout.bars.map((bl, i) => (
            <BarGlyphs key={bl.bar.index} layout={bl} barTicks={barTicks} final={i === layout.bars.length - 1} showSticking={showSticking} />
          ))}

          <line ref={cursorRef} x1={0} x2={0} y1={0} y2={0} stroke="var(--df-lh)" strokeWidth={2} style={{ opacity: 0 }} pointerEvents="none" />
        </svg>
      )}
    </div>
  );
}

function BarGlyphs({ layout, barTicks, final, showSticking }: { layout: BarLayout; barTicks: number; final: boolean; showSticking: boolean }) {
  const { bar, line, x: bx, w } = layout;
  const xOf = (tick: number) => bx + PAD + (tick / barTicks) * (w - 2 * PAD);
  const top = stepY(line, 8);
  const bottom = stepY(line, 0);
  const sysTop = line * (SYS_H + SYS_GAP);

  // Extremidade da haste de cada nota (barras planas por grupo).
  const stemEnd = new Map<ENote, number>();
  const ys = (n: ENote) => n.heads.map((h) => stepY(line, h.step));
  for (const g of bar.groups) {
    if (!g.beamed.length) continue;
    const y = g.voice === 'up' ? Math.min(...g.beamed.flatMap(ys)) - STEM + 2 : Math.max(...g.beamed.flatMap(ys)) + STEM - 2;
    g.beamed.forEach((n) => stemEnd.set(n, y));
  }
  for (const n of bar.notes) {
    if (!stemEnd.has(n)) stemEnd.set(n, n.voice === 'up' ? Math.min(...ys(n)) - STEM : Math.max(...ys(n)) + STEM);
  }
  const stemX = (n: ENote) => xOf(n.tick) + (n.voice === 'up' ? HEAD_DX : -HEAD_DX);
  const restY = (r: ERest) => stepY(line, r.voice === 'up' ? 6 : 1.5);
  const dir = (v: Voice) => (v === 'up' ? 1 : -1);

  return (
    <g>
      {/* Barras de ligação, números de quiáltera */}
      {bar.groups.map((g, gi) => {
        const notes = g.beamed;
        const parts: ReactNode[] = [];
        if (notes.length) {
          const y = stemEnd.get(notes[0])!;
          const d = dir(g.voice);
          parts.push(<line key="b1" x1={stemX(notes[0])} x2={stemX(notes[notes.length - 1])} y1={y} y2={y} stroke="currentColor" strokeWidth={4.2} />);
          for (let level = 2; level <= 3; level++) {
            const ly = y + d * 6.5 * (level - 1);
            notes.forEach((n, i) => {
              if (n.beams < level) return;
              const next = notes[i + 1];
              const prev = notes[i - 1];
              if (next && next.beams >= level) {
                parts.push(<line key={`s${level}-${i}`} x1={stemX(n)} x2={stemX(next)} y1={ly} y2={ly} stroke="currentColor" strokeWidth={4.2} />);
              } else if (!prev || prev.beams < level) {
                const toRight = !!next || !prev;
                const x1 = stemX(n);
                parts.push(<line key={`t${level}-${i}`} x1={x1} x2={x1 + (toRight ? 8 : -8)} y1={ly} y2={ly} stroke="currentColor" strokeWidth={4.2} />);
              }
            });
          }
        }
        if (g.tuplet) {
          const inGroup = bar.notes.filter((n) => n.voice === g.voice && n.tick >= g.start && n.tick < g.start + g.length);
          if (inGroup.length) {
            const ref = notes.length ? stemEnd.get(notes[0])! : stemEnd.get(inGroup[0])!;
            const cx = inGroup.reduce((a, n) => a + stemX(n), 0) / inGroup.length;
            const ty = g.voice === 'up' ? ref - 19 : ref + 28;
            parts.push(
              <text key="tu" x={cx} y={ty} fontSize={11} fontStyle="italic" fontWeight={700} textAnchor="middle" fill="currentColor">
                {g.tuplet}
              </text>,
            );
          }
        }
        return <g key={gi}>{parts}</g>;
      })}

      {/* Notas */}
      {bar.notes.map((n, i) => {
        const x = xOf(n.tick);
        const headYs = ys(n);
        const end = stemEnd.get(n)!;
        const beamed = bar.groups.some((g) => g.beamed.includes(n));
        const d = dir(n.voice);
        const sx = stemX(n);
        const stemFrom = n.voice === 'up' ? Math.max(...headYs) : Math.min(...headYs);
        const accent = n.heads.some((h) => h.accent);
        const hand = n.heads.find((h) => h.limb === 'rightHand' || h.limb === 'leftHand');
        const ornament = n.heads.find((h) => h.ornament !== 'none')?.ornament ?? 'none';
        return (
          <g key={i} className="staff-note" data-abs={n.heads[0].abs}>
            {n.heads.map((h, k) => {
              const y = stepY(line, h.step);
              const ledgers: number[] = [];
              for (let s = 10; s <= h.step; s += 2) ledgers.push(s);
              for (let s = -2; s >= h.step; s -= 2) ledgers.push(s);
              return (
                <Fragment key={k}>
                  {ledgers.map((s) => (
                    <line key={s} x1={x - 8.5} x2={x + 8.5} y1={stepY(line, s)} y2={stepY(line, s)} stroke="currentColor" strokeWidth={1} />
                  ))}
                  <Head x={x} y={y} kind={h.head} />
                  {h.ghost && (
                    <g fontSize={13} fill="currentColor" textAnchor="middle">
                      <text x={x - 9.5} y={y + 4.5}>(</text>
                      <text x={x + 9.5} y={y + 4.5}>)</text>
                    </g>
                  )}
                  {n.dots > 0 && <circle cx={x + 9} cy={h.step % 2 === 0 ? y - H : y} r={1.7} fill="currentColor" />}
                </Fragment>
              );
            })}
            {/* Apojaturas (flam = 1, drag = 2), na mesma altura da nota principal */}
            {ornament !== 'none' &&
              Array.from({ length: ornament === 'drag' ? 2 : 1 }, (_, g) => {
                const gx = x - 13 - g * 7;
                const gy = headYs[0];
                return (
                  <g key={`g${g}`}>
                    <Head x={gx} y={gy} kind="normal" small />
                    <line x1={gx + 3} x2={gx + 3} y1={gy} y2={gy - 16} stroke="currentColor" strokeWidth={1} />
                    {g === 0 && <line x1={gx - 2} x2={gx + 7} y1={gy - 6} y2={gy - 13} stroke="currentColor" strokeWidth={1} />}
                  </g>
                );
              })}
            <line x1={sx} x2={sx} y1={stemFrom} y2={end} stroke="currentColor" strokeWidth={1.3} />
            {/* Colchetes de notas soltas */}
            {!beamed &&
              n.beams > 0 &&
              Array.from({ length: n.beams }, (_, k) => (
                <path
                  key={`f${k}`}
                  d={`M${sx},${end + d * k * 6} q${7},${d * 5} ${6},${d * 14}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                />
              ))}
            {accent && <Accent x={x} y={n.voice === 'up' ? end - 9 : end + 9} />}
            {showSticking && hand && (
              <text x={x} y={sysTop + 13} fontSize={11} fontWeight={700} textAnchor="middle" fill={hand.limb === 'rightHand' ? 'var(--df-rh)' : 'var(--df-lh)'}>
                {stickingLetter(hand.limb)}
              </text>
            )}
          </g>
        );
      })}

      {/* Pausas */}
      {bar.rests.map((r, i) => (
        <Rest key={`r${i}`} x={xOf(r.tick) + 2} y={restY(r)} beams={r.beams} dots={r.dots} />
      ))}

      {/* Barra de compasso */}
      <line x1={final ? bx + w - 6 : bx + w} x2={final ? bx + w - 6 : bx + w} y1={top} y2={bottom} stroke="currentColor" strokeWidth={1.2} />
      {final && <rect x={bx + w - 3.5} y={top} width={3.5} height={bottom - top} fill="currentColor" />}
    </g>
  );
}

/** Explica onde cada peça fica na pauta. */
export function StaffKey() {
  return (
    <p className="text-xs text-muted">
      <strong className="text-fg">Pauta:</strong> crash (x, acima da pauta) · chimbal (x, acima da 5ª linha) · ride (x, 5ª linha) · tom 1 (4º espaço) · tom 2
      (4ª linha) · caixa (3º espaço) · surdo (2º espaço) · bumbo (1º espaço) · pedal do chimbal (x, abaixo). Mãos com haste para cima, pés para
      baixo. Letras D/E acima = mão direita/esquerda; ( ) = ghost note; &gt; = acento; nota pequena = apojatura.
    </p>
  );
}
