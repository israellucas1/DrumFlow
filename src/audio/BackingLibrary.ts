import { createId } from '../music/ids';

export const MAX_TRACK_BYTES = 30 * 1024 * 1024;

export interface BackingTrack {
  id: string;
  name: string;
  /** Andamento original da música. */
  bpm: number;
  /** Segundo do arquivo onde cai o tempo 1 do exercício. */
  offsetSec: number;
  file: string;
  size: number;
}

export type BackingStatus = 'loading' | 'ready' | 'unavailable';

/**
 * Faixas de acompanhamento guardadas pelo servidor em `dados/faixas/`.
 * Só a faixa em uso é decodificada (músicas inteiras ocupam bastante memória).
 */
export class BackingLibrary {
  private status: BackingStatus = 'loading';
  private tracks: BackingTrack[] = [];
  private readonly buffers = new Map<string, AudioBuffer>();
  private loadingId: string | null = null;
  private decodeCtx: OfflineAudioContext | null = null;
  private readonly listeners = new Set<() => void>();
  private snapshot = { status: this.status, tracks: this.tracks, loadingId: this.loadingId };

  constructor(private readonly base = '/api/faixas') {}

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  getSnapshot = () => this.snapshot;

  private emit() {
    this.snapshot = { status: this.status, tracks: this.tracks, loadingId: this.loadingId };
    this.listeners.forEach((l) => l());
  }

  get(id: string): BackingTrack | null {
    return this.tracks.find((t) => t.id === id) ?? null;
  }

  buffer(id: string): AudioBuffer | null {
    return this.buffers.get(id) ?? null;
  }

  async refresh(): Promise<void> {
    try {
      const r = await fetch(this.base, { cache: 'no-store' });
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) throw new Error('sem servidor');
      this.tracks = ((await r.json()) as { tracks: BackingTrack[] }).tracks;
      this.status = 'ready';
    } catch {
      this.status = 'unavailable';
    }
    this.emit();
  }

  private decode(data: ArrayBuffer): Promise<AudioBuffer> {
    // OfflineAudioContext só para decodificar; o AudioBuffer serve em qualquer contexto.
    if (!this.decodeCtx) this.decodeCtx = new OfflineAudioContext(2, 1, 44100);
    return this.decodeCtx.decodeAudioData(data);
  }

  /** Carrega e decodifica a faixa (libera as outras da memória). */
  async ensureLoaded(id: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(id);
    if (cached) return cached;
    this.loadingId = id;
    this.emit();
    try {
      const r = await fetch(`${this.base}/${encodeURIComponent(id)}/audio`, { cache: 'no-store' });
      if (!r.ok) throw new Error('Faixa não encontrada.');
      const buffer = await this.decode(await r.arrayBuffer());
      this.buffers.clear();
      this.buffers.set(id, buffer);
      return buffer;
    } catch {
      return null;
    } finally {
      if (this.loadingId === id) this.loadingId = null;
      this.emit();
    }
  }

  async upload(file: File): Promise<BackingTrack> {
    if (this.status === 'unavailable') throw new Error('Faixas exigem o app aberto pelo servidor (Iniciar-DrumFlow.bat).');
    if (file.size > MAX_TRACK_BYTES) throw new Error('Arquivo grande demais (máximo 30 MB).');
    const data = await file.arrayBuffer();
    let buffer: AudioBuffer;
    try {
      buffer = await this.decode(data.slice(0));
    } catch {
      throw new Error('Não foi possível ler esse arquivo de áudio. Use MP3, WAV ou OGG.');
    }
    const id = createId('faixa').replace(/[^A-Za-z0-9_-]/g, '');
    const r = await fetch(`${this.base}/${id}/audio`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
      body: data,
    });
    const body = (await r.json().catch(() => null)) as { track?: BackingTrack; error?: string } | null;
    if (!r.ok || !body?.track) throw new Error(body?.error ?? 'Falha ao salvar a faixa.');
    this.buffers.clear();
    this.buffers.set(id, buffer);
    this.tracks = [...this.tracks, body.track].sort((a, b) => a.name.localeCompare(b.name));
    this.emit();
    return body.track;
  }

  async update(id: string, patch: Partial<Pick<BackingTrack, 'name' | 'bpm' | 'offsetSec'>>): Promise<void> {
    const r = await fetch(`${this.base}/${encodeURIComponent(id)}/meta`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const body = (await r.json().catch(() => null)) as { track?: BackingTrack; error?: string } | null;
    if (!r.ok || !body?.track) throw new Error(body?.error ?? 'Falha ao salvar.');
    this.tracks = this.tracks.map((t) => (t.id === id ? body.track! : t));
    this.emit();
  }

  async remove(id: string): Promise<void> {
    const r = await fetch(`${this.base}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Falha ao remover a faixa.');
    this.buffers.delete(id);
    this.tracks = this.tracks.filter((t) => t.id !== id);
    this.emit();
  }
}
