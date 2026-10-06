import { describe, expect, it } from 'vitest';
import { LocalStorageExerciseRepository } from '../storage/ExerciseRepository';
import { RemoteUnavailableError, SyncedExerciseRepository, type RemoteListing, type RemoteStore } from '../storage/SyncedExerciseRepository';
import { MemoryStore } from '../storage/storage';
import { createBlankExercise } from '../music/exerciseOps';
import { DEMO_EXERCISES } from '../data/exampleExercises';
import type { Exercise } from '../music/types';

/** "Servidor" em memória que simula a pasta de arquivos. */
class FakeRemote implements RemoteStore {
  files = new Map<string, Exercise>();
  initialized = false;
  down = false;
  missing = false;
  async list(): Promise<RemoteListing> {
    if (this.missing) throw new RemoteUnavailableError('sem api');
    if (this.down) throw new Error('rede');
    return { initialized: this.initialized, directory: '/dados/exercicios', exercises: [...this.files.values()].map((e) => structuredClone(e)) };
  }
  async put(ex: Exercise) {
    if (this.down) throw new Error('rede');
    this.initialized = true;
    this.files.set(ex.id, structuredClone(ex));
  }
  async remove(id: string) {
    if (this.down) throw new Error('rede');
    this.files.delete(id);
  }
}

const make = (remote: FakeRemote, store = new MemoryStore()) =>
  new SyncedExerciseRepository(new LocalStorageExerciseRepository(store), remote);

describe('salvamento em arquivo (servidor)', () => {
  it('na primeira conexão envia os exercícios do navegador para a pasta', async () => {
    const remote = new FakeRemote();
    const repo = make(remote);
    await repo.sync();
    expect(remote.files.size).toBe(DEMO_EXERCISES.length);
    expect(repo.getStatus().mode).toBe('server');
  });

  it('salvar e excluir gravam no servidor', async () => {
    const remote = new FakeRemote();
    const repo = make(remote);
    await repo.sync();
    const ex = repo.save({ ...createBlankExercise(), name: 'Meu groove' });
    await repo.flush();
    expect(remote.files.get(ex.id)?.name).toBe('Meu groove');
    repo.remove(ex.id);
    await repo.flush();
    expect(remote.files.has(ex.id)).toBe(false);
  });

  it('outro aparelho (navegador vazio) recebe os exercícios dos arquivos', async () => {
    const remote = new FakeRemote();
    const pc = make(remote);
    await pc.sync();
    const ex = pc.save({ ...createBlankExercise(), name: 'Feito no PC' });
    await pc.flush();
    const celular = make(remote, new MemoryStore());
    const changed = await celular.sync();
    expect(changed).toBe(true);
    expect(celular.get(ex.id)?.name).toBe('Feito no PC');
  });

  it('com o servidor fora do ar, guarda na fila e envia quando volta', async () => {
    const remote = new FakeRemote();
    const repo = make(remote);
    await repo.sync();
    remote.down = true;
    const ex = repo.save({ ...createBlankExercise(), name: 'Offline' });
    await repo.flush();
    expect(repo.getStatus()).toMatchObject({ mode: 'offline', pending: 1 });
    expect(repo.get(ex.id)?.name).toBe('Offline'); // continua disponível no navegador
    remote.down = false;
    await repo.sync();
    expect(remote.files.get(ex.id)?.name).toBe('Offline');
    expect(repo.getStatus()).toMatchObject({ mode: 'server', pending: 0 });
  });

  it('alteração local pendente não é sobrescrita pelo servidor', async () => {
    const remote = new FakeRemote();
    const repo = make(remote);
    await repo.sync();
    const ex = repo.save({ ...createBlankExercise(), name: 'v1' });
    await repo.flush();
    remote.down = true;
    repo.save({ ...ex, name: 'v2' });
    await repo.flush();
    remote.down = false;
    await repo.sync();
    expect(repo.get(ex.id)?.name).toBe('v2');
    expect(remote.files.get(ex.id)?.name).toBe('v2');
  });

  it('primeira sincronização de um navegador não perde o que só existia nele', async () => {
    const remote = new FakeRemote();
    const pc = make(remote);
    await pc.sync(); // pasta criada por outro navegador
    // Navegador antigo, com exercício salvo antes de existir a pasta de arquivos
    const store = new MemoryStore();
    const antigo = new LocalStorageExerciseRepository(store);
    const meu = antigo.save({ ...createBlankExercise(), name: 'Criado antes da pasta' });
    const browser = make(remote, store);
    await browser.sync();
    expect(browser.get(meu.id)?.name).toBe('Criado antes da pasta');
    expect(remote.files.get(meu.id)?.name).toBe('Criado antes da pasta');
    // Depois disso, a pasta passa a mandar: exclusão em outro aparelho vale aqui também
    await pc.sync();
    pc.remove(meu.id);
    await pc.flush();
    await browser.sync();
    expect(browser.get(meu.id)).toBeNull();
  });

  it('exemplos padrão de um navegador novo não sobrescrevem exemplos editados na pasta', async () => {
    const remote = new FakeRemote();
    const pc = make(remote);
    await pc.sync();
    const demo = pc.get('demo-rock-groove')!;
    pc.save({ ...demo, name: 'Rock editado' });
    await pc.flush();
    const celular = make(remote, new MemoryStore());
    await celular.sync();
    expect(celular.get('demo-rock-groove')?.name).toBe('Rock editado');
    expect(remote.files.get('demo-rock-groove')?.name).toBe('Rock editado');
  });

  it('sem API de arquivos (site estático), funciona só no navegador', async () => {
    const remote = new FakeRemote();
    remote.missing = true;
    const repo = make(remote);
    await repo.sync();
    expect(repo.getStatus().mode).toBe('local');
    const ex = repo.save({ ...createBlankExercise(), name: 'Local' });
    expect(repo.get(ex.id)?.name).toBe('Local');
  });
});
