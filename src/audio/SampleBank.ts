import type { SoundSlot } from './soundCatalog';

export const MAX_SAMPLE_BYTES = 5 * 1024 * 1024;

export interface SampleInfo {
  slot: SoundSlot;
  file: string;
  size: number;
}

export type SampleBankStatus = 'loading' | 'ready' | 'unavailable';

/**
 * Sons do usuário: arquivos guardados pelo servidor em `dados/sons/` e decodificados
 * para AudioBuffer (que pode ser tocado em qualquer AudioContext).
 */
export class SampleBank {
  private readonly buffers = new Map<SoundSlot, AudioBuffer>();
  private infos: SampleInfo[] = [];
  private status: SampleBankStatus = 'loading';
  private decodeCtx: OfflineAudioContext | null = null;
  private readonly listeners = new Set<() => void>();
  private snapshot = { status: this.status, infos: this.infos };

  constructor(private readonly base = '/api/sons') {}

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  getSnapshot = () => this.snapshot;

  private emit() {
    this.snapshot = { status: this.status, infos: this.infos };
    this.listeners.forEach((l) => l());
  }

  get(slot: SoundSlot): AudioBuffer | null {
    return this.buffers.get(slot) ?? null;
  }

  private async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    if (!this.decodeCtx) this.decodeCtx = new OfflineAudioContext(1, 1, 44100);
    return this.decodeCtx.decodeAudioData(data);
  }

  async load(): Promise<void> {
    try {
      const r = await fetch(this.base, { cache: 'no-store' });
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('sem servidor');
      const { sounds } = (await r.json()) as { sounds: SampleInfo[] };
      this.infos = sounds;
      await Promise.all(
        sounds.map(async (s) => {
          try {
            const f = await fetch(`${this.base}/${s.slot}`, { cache: 'no-store' });
            this.buffers.set(s.slot, await this.decode(await f.arrayBuffer()));
          } catch {
            /* arquivo ilegível: ignora este som */
          }
        }),
      );
      this.status = 'ready';
    } catch {
      this.status = 'unavailable';
    }
    this.emit();
  }

  /** Valida (decodificando) e envia o arquivo. Lança erro com mensagem em português. */
  async upload(slot: SoundSlot, file: File): Promise<void> {
    if (this.status === 'unavailable') throw new Error('Sons próprios exigem o app aberto pelo servidor (Iniciar-DrumFlow.bat).');
    if (file.size > MAX_SAMPLE_BYTES) throw new Error('Arquivo grande demais (máximo 5 MB). Use um som curto.');
    const data = await file.arrayBuffer();
    let buffer: AudioBuffer;
    try {
      buffer = await this.decode(data.slice(0));
    } catch {
      throw new Error('Não foi possível ler esse arquivo de áudio. Use WAV, MP3 ou OGG.');
    }
    const r = await fetch(`${this.base}/${slot}`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
      body: data,
    });
    if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Falha ao salvar o som.');
    this.buffers.set(slot, buffer);
    this.infos = [...this.infos.filter((i) => i.slot !== slot), { slot, file: file.name, size: file.size }];
    this.emit();
  }

  async remove(slot: SoundSlot): Promise<void> {
    const r = await fetch(`${this.base}/${slot}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Falha ao remover o som.');
    this.buffers.delete(slot);
    this.infos = this.infos.filter((i) => i.slot !== slot);
    this.emit();
  }
}
