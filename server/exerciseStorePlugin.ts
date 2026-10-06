/**
 * Plugin do Vite que expõe uma API mínima de arquivos para os exercícios:
 *
 *   GET    /api/exercicios          → { initialized, directory, exercises: [...] }
 *   PUT    /api/exercicios/:id      → grava <dir>/exercicios/<id>.json (escrita atômica)
 *   DELETE /api/exercicios/:id      → move o arquivo para <dir>/lixeira/ (não apaga de vez)
 *
 *   GET    /api/sons                → lista os sons do usuário em <dir>/sons/
 *   GET    /api/sons/:slot          → o arquivo de áudio
 *   PUT    /api/sons/:slot          → grava (o anterior vai para a lixeira)
 *   DELETE /api/sons/:slot          → move para a lixeira
 *
 * Funciona tanto em `vite` (dev) quanto em `vite preview`.
 */
import type { Connect, Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ID_RE = /^[A-Za-z0-9_-]{1,120}$/;
const MAX_BODY = 2_000_000;
const BASE = '/api/exercicios';

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBuffer(req: IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) {
        reject(new Error('Arquivo grande demais.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const readBody = async (req: IncomingMessage) => (await readBuffer(req, MAX_BODY)).toString('utf8');

// ───────────── Sons do usuário ─────────────

const SOUND_BASE = '/api/sons';
const SOUND_SLOTS = new Set([
  'crash', 'ride', 'hiHat', 'tom1', 'tom2', 'floorTom', 'snare', 'kick', 'pedalHiHat',
  'click-downbeat', 'click-beat', 'click-subdivision',
]);
const MAX_SOUND = 5 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/vnd.wave': 'wav',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/webm': 'webm',
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
};
const TYPE_BY_EXT: Record<string, string> = {
  wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', webm: 'audio/webm', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
};

function extFrom(contentType: string | undefined, fileName: string): string | null {
  const byType = EXT_BY_TYPE[(contentType ?? '').split(';')[0].trim().toLowerCase()];
  if (byType) return byType;
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return TYPE_BY_EXT[ext] ? ext : null;
}

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function exerciseStorePlugin(dataDir: string): Plugin {
  const root = path.resolve(dataDir);
  const exDir = path.join(root, 'exercicios');
  const trashDir = path.join(root, 'lixeira');
  const fileFor = (id: string) => path.join(exDir, `${id}.json`);
  const soundDir = path.join(root, 'sons');

  /** Arquivo atual de um som (qualquer extensão), ou null. */
  async function findSound(slot: string): Promise<{ file: string; ext: string } | null> {
    if (!(await exists(soundDir))) return null;
    for (const name of await fs.readdir(soundDir)) {
      const ext = path.extname(name).slice(1);
      if (path.basename(name, `.${ext}`) === slot && TYPE_BY_EXT[ext]) return { file: path.join(soundDir, name), ext };
    }
    return null;
  }

  async function handleSounds(req: IncomingMessage, res: ServerResponse, url: string) {
    const pathname = url.split('?')[0];
    if (pathname === SOUND_BASE || pathname === `${SOUND_BASE}/`) {
      if (req.method !== 'GET') return send(res, 405, { error: 'Método não permitido.' });
      const sounds: { slot: string; file: string; size: number }[] = [];
      for (const slot of SOUND_SLOTS) {
        const found = await findSound(slot);
        if (!found) continue;
        let original = path.basename(found.file);
        try {
          original = (await fs.readFile(`${found.file}.nome`, 'utf8')).trim() || original;
        } catch {
          /* sem nome original */
        }
        sounds.push({ slot, file: original, size: (await fs.stat(found.file)).size });
      }
      return send(res, 200, { directory: soundDir, sounds });
    }
    const slot = decodeURIComponent(pathname.slice(SOUND_BASE.length + 1));
    if (!SOUND_SLOTS.has(slot)) return send(res, 400, { error: 'Som inválido.' });

    if (req.method === 'GET') {
      const found = await findSound(slot);
      if (!found) return send(res, 404, { error: 'Sem arquivo.' });
      res.statusCode = 200;
      res.setHeader('Content-Type', TYPE_BY_EXT[found.ext]);
      res.setHeader('Cache-Control', 'no-store');
      res.end(await fs.readFile(found.file));
      return;
    }
    if (req.method === 'PUT') {
      const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'som'));
      const ext = extFrom(req.headers['content-type'], name);
      if (!ext) return send(res, 400, { error: 'Formato não suportado. Use WAV, MP3, OGG, M4A ou FLAC.' });
      let data: Buffer;
      try {
        data = await readBuffer(req, MAX_SOUND);
      } catch {
        return send(res, 413, { error: 'Arquivo grande demais (máximo 5 MB).' });
      }
      await fs.mkdir(soundDir, { recursive: true });
      const old = await findSound(slot);
      if (old) {
        await fs.mkdir(trashDir, { recursive: true });
        await fs.rename(old.file, path.join(trashDir, `${slot}.${Date.now()}.${old.ext}`));
      }
      const target = path.join(soundDir, `${slot}.${ext}`);
      await fs.writeFile(`${target}.tmp`, data);
      await fs.rename(`${target}.tmp`, target);
      await fs.writeFile(`${target}.nome`, name.slice(0, 200), 'utf8');
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      const found = await findSound(slot);
      if (found) {
        await fs.mkdir(trashDir, { recursive: true });
        await fs.rename(found.file, path.join(trashDir, `${slot}.${Date.now()}.${found.ext}`));
        await fs.rm(`${found.file}.nome`, { force: true });
      }
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Método não permitido.' });
  }

  // ───────────── Faixas de acompanhamento ─────────────
  // dados/faixas/<id>.<ext> (áudio) + dados/faixas/<id>.json (nome, BPM, início do 1º tempo)
  const trackDir = path.join(root, 'faixas');
  const TRACK_BASE = '/api/faixas';
  const MAX_TRACK = 30 * 1024 * 1024;

  interface TrackMeta {
    id: string;
    name: string;
    bpm: number;
    offsetSec: number;
    file: string;
    ext: string;
    size: number;
  }

  async function readMeta(id: string): Promise<TrackMeta | null> {
    try {
      return JSON.parse(await fs.readFile(path.join(trackDir, `${id}.json`), 'utf8')) as TrackMeta;
    } catch {
      return null;
    }
  }

  async function writeMeta(meta: TrackMeta) {
    await fs.mkdir(trackDir, { recursive: true });
    const target = path.join(trackDir, `${meta.id}.json`);
    await fs.writeFile(`${target}.tmp`, JSON.stringify(meta, null, 2), 'utf8');
    await fs.rename(`${target}.tmp`, target);
  }

  async function handleTracks(req: IncomingMessage, res: ServerResponse, url: string) {
    const parts = url.split('?')[0].slice(TRACK_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    if (parts.length === 0) {
      if (req.method !== 'GET') return send(res, 405, { error: 'Método não permitido.' });
      const tracks: TrackMeta[] = [];
      if (await exists(trackDir)) {
        for (const name of await fs.readdir(trackDir)) {
          if (!name.endsWith('.json')) continue;
          const meta = await readMeta(name.slice(0, -5));
          if (meta) tracks.push(meta);
        }
      }
      return send(res, 200, { directory: trackDir, tracks: tracks.sort((a, b) => a.name.localeCompare(b.name)) });
    }
    const [id, sub] = parts;
    if (!ID_RE.test(id)) return send(res, 400, { error: 'Id inválido.' });

    if (sub === 'audio' && req.method === 'GET') {
      const meta = await readMeta(id);
      if (!meta) return send(res, 404, { error: 'Faixa não encontrada.' });
      res.statusCode = 200;
      res.setHeader('Content-Type', TYPE_BY_EXT[meta.ext] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(await fs.readFile(path.join(trackDir, `${id}.${meta.ext}`)));
      return;
    }
    if (sub === 'audio' && req.method === 'PUT') {
      const name = decodeURIComponent(String(req.headers['x-file-name'] ?? 'faixa'));
      const ext = extFrom(req.headers['content-type'], name);
      if (!ext) return send(res, 400, { error: 'Formato não suportado. Use MP3, WAV, OGG, M4A ou FLAC.' });
      let data: Buffer;
      try {
        data = await readBuffer(req, MAX_TRACK);
      } catch {
        return send(res, 413, { error: 'Arquivo grande demais (máximo 30 MB).' });
      }
      await fs.mkdir(trackDir, { recursive: true });
      const old = await readMeta(id);
      if (old && old.ext !== ext) await fs.rm(path.join(trackDir, `${id}.${old.ext}`), { force: true });
      const target = path.join(trackDir, `${id}.${ext}`);
      await fs.writeFile(`${target}.tmp`, data);
      await fs.rename(`${target}.tmp`, target);
      const meta: TrackMeta = {
        id,
        name: old?.name ?? name.replace(/\.[^.]+$/, '').slice(0, 120),
        bpm: old?.bpm ?? 100,
        offsetSec: old?.offsetSec ?? 0,
        file: name.slice(0, 200),
        ext,
        size: data.length,
      };
      await writeMeta(meta);
      return send(res, 200, { track: meta });
    }
    if (sub === 'meta' && req.method === 'PUT') {
      const meta = await readMeta(id);
      if (!meta) return send(res, 404, { error: 'Faixa não encontrada.' });
      let patch: Partial<TrackMeta>;
      try {
        patch = JSON.parse(await readBody(req));
      } catch {
        return send(res, 400, { error: 'JSON inválido.' });
      }
      const next: TrackMeta = {
        ...meta,
        name: typeof patch.name === 'string' && patch.name.trim() ? patch.name.trim().slice(0, 120) : meta.name,
        bpm: typeof patch.bpm === 'number' && patch.bpm >= 20 && patch.bpm <= 300 ? Math.round(patch.bpm * 100) / 100 : meta.bpm,
        offsetSec: typeof patch.offsetSec === 'number' && patch.offsetSec >= 0 ? Math.round(patch.offsetSec * 1000) / 1000 : meta.offsetSec,
      };
      await writeMeta(next);
      return send(res, 200, { track: next });
    }
    if (!sub && req.method === 'DELETE') {
      const meta = await readMeta(id);
      if (meta) {
        await fs.mkdir(trashDir, { recursive: true });
        const stamp = Date.now();
        await fs.rename(path.join(trackDir, `${id}.${meta.ext}`), path.join(trashDir, `${id}.${stamp}.${meta.ext}`)).catch(() => {});
        await fs.rename(path.join(trackDir, `${id}.json`), path.join(trashDir, `${id}.${stamp}.json`));
      }
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Método não permitido.' });
  }

  // ───────────── Progresso dos Planos de Estudo (um documento JSON) ─────────────
  const studyFile = path.join(root, 'estudo', 'progresso.json');

  async function handleStudy(req: IncomingMessage, res: ServerResponse) {
    if (req.method === 'GET') {
      try {
        return send(res, 200, { progress: JSON.parse(await fs.readFile(studyFile, 'utf8')) });
      } catch {
        return send(res, 200, { progress: null });
      }
    }
    if (req.method === 'PUT') {
      let data: unknown;
      try {
        data = JSON.parse(await readBody(req));
      } catch {
        return send(res, 400, { error: 'JSON inválido.' });
      }
      if (!data || typeof data !== 'object' || typeof (data as { updatedAt?: unknown }).updatedAt !== 'number') {
        return send(res, 400, { error: 'Progresso inválido.' });
      }
      // Não sobrescreve uma versão mais nova vinda de outro aparelho.
      try {
        const current = JSON.parse(await fs.readFile(studyFile, 'utf8')) as { updatedAt?: number };
        if ((current.updatedAt ?? 0) > (data as { updatedAt: number }).updatedAt) return send(res, 409, { progress: current });
      } catch {
        /* sem arquivo ainda */
      }
      await fs.mkdir(path.dirname(studyFile), { recursive: true });
      const tmp = `${studyFile}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(tmp, studyFile);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Método não permitido.' });
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: string) {
    const pathname = url.split('?')[0];
    if (pathname === BASE || pathname === `${BASE}/`) {
      if (req.method !== 'GET') return send(res, 405, { error: 'Método não permitido.' });
      const initialized = await exists(exDir);
      const exercises: unknown[] = [];
      let unreadable = 0;
      if (initialized) {
        for (const name of await fs.readdir(exDir)) {
          if (!name.endsWith('.json')) continue;
          try {
            exercises.push(JSON.parse(await fs.readFile(path.join(exDir, name), 'utf8')));
          } catch {
            unreadable++;
          }
        }
      }
      return send(res, 200, { initialized, directory: exDir, exercises, unreadable });
    }

    const id = decodeURIComponent(pathname.slice(BASE.length + 1));
    if (!ID_RE.test(id)) return send(res, 400, { error: 'Id inválido.' });

    if (req.method === 'PUT') {
      let data: unknown;
      try {
        data = JSON.parse(await readBody(req));
      } catch {
        return send(res, 400, { error: 'JSON inválido.' });
      }
      if (!data || typeof data !== 'object' || (data as { id?: unknown }).id !== id) {
        return send(res, 400, { error: 'O id do corpo não corresponde ao endereço.' });
      }
      await fs.mkdir(exDir, { recursive: true });
      const tmp = `${fileFor(id)}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
      await fs.rename(tmp, fileFor(id));
      return send(res, 200, { ok: true });
    }

    if (req.method === 'DELETE') {
      if (await exists(fileFor(id))) {
        await fs.mkdir(trashDir, { recursive: true });
        await fs.rename(fileFor(id), path.join(trashDir, `${id}.${Date.now()}.json`));
      }
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'Método não permitido.' });
  }

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? '';
    const onError = (err: unknown) => send(res, 500, { error: err instanceof Error ? err.message : String(err) });
    if (url.startsWith(SOUND_BASE)) return void handleSounds(req, res, url).catch(onError);
    if (url.split('?')[0] === '/api/estudo') return void handleStudy(req, res).catch(onError);
    if (url.startsWith(TRACK_BASE)) return void handleTracks(req, res, url).catch(onError);
    if (!url.startsWith(BASE)) return next();
    handle(req, res, url).catch(onError);
  };

  return {
    name: 'drumflow-exercise-store',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
