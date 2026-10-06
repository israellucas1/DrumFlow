export interface TempoSegment {
  /** Instante no relógio de áudio (s) em que o segmento começa. */
  time: number;
  /** Posição musical linear (semínimas) nesse instante. */
  quarter: number;
  bpm: number;
}

/**
 * Mapa tempo ↔ posição musical, linear por partes.
 *
 * Cada mudança de BPM cria um novo segmento ancorado num ponto (tempo, posição)
 * já existente no mapa, então a função é contínua: nenhuma posição "salta" e
 * nenhum instante é contado duas vezes. Todas as conversões partem de âncoras
 * absolutas — não há soma incremental, então não há acúmulo de erro.
 */
export class TempoMap {
  private segs: TempoSegment[] = [{ time: 0, quarter: 0, bpm: 80 }];
  private start = 0;

  reset(time: number, quarter: number, bpm: number) {
    this.segs = [{ time, quarter, bpm }];
    this.start = quarter;
  }

  /** Posição em que a reprodução atual começou. */
  get startQuarter(): number {
    return this.start;
  }

  get bpm(): number {
    return this.segs[this.segs.length - 1].bpm;
  }

  get segments(): readonly TempoSegment[] {
    return this.segs;
  }

  quarterAt(time: number): number {
    let s = this.segs[0];
    for (const seg of this.segs) {
      if (seg.time <= time) s = seg;
      else break;
    }
    return s.quarter + ((time - s.time) * s.bpm) / 60;
  }

  timeAt(quarter: number): number {
    let s = this.segs[0];
    for (const seg of this.segs) {
      if (seg.quarter <= quarter) s = seg;
      else break;
    }
    return s.time + ((quarter - s.quarter) * 60) / s.bpm;
  }

  /** Aplica um novo BPM a partir da posição `atQuarter` (nunca antes do último segmento). */
  changeTempo(atQuarter: number, bpm: number) {
    const last = this.segs[this.segs.length - 1];
    const q = Math.max(atQuarter, last.quarter);
    if (q - last.quarter < 1e-9) {
      // Nada foi agendado depois do último segmento: basta trocar seu andamento.
      this.segs[this.segs.length - 1] = { ...last, bpm };
      return;
    }
    this.segs.push({ time: this.timeAt(q), quarter: q, bpm });
  }

  /** Remove segmentos que terminaram antes de `beforeTime`. */
  prune(beforeTime: number) {
    while (this.segs.length > 1 && this.segs[1].time <= beforeTime) this.segs.shift();
  }
}
