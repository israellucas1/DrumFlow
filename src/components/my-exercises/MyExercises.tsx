import { CopyPlus, PencilLine, Play, Plus, RotateCcw, TextCursorInput, Trash2 } from 'lucide-react';
import { useExercises, usePractice } from '../../app/AppState';
import { navigate } from '../../app/router';
import { formatTimeSignature } from '../../music/timeSignature';
import type { Exercise } from '../../music/types';
import { Button, Panel } from '../ui/primitives';
import { useFeedback } from '../ui/feedback';
import { MiniPattern } from '../rudiment-library/MiniPattern';
import { SyncBadge } from './SyncBadge';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function MyExercises() {
  const { userExercises, remove, duplicate, rename, restoreDemos } = useExercises();
  const practice = usePractice();
  const { confirm, prompt, toast } = useFeedback();

  const onRename = async (ex: Exercise) => {
    const name = await prompt({ title: 'Renomear exercício', label: 'Nome', initial: ex.name, confirmLabel: 'Renomear' });
    if (name === null || !name.trim()) return;
    rename(ex.id, name.trim());
  };

  const onDelete = async (ex: Exercise) => {
    const ok = await confirm({
      title: `Excluir "${ex.name}"?`,
      message: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    remove(ex.id);
    toast('Exercício excluído.');
  };

  const onRestore = async () => {
    const ok = await confirm({
      title: 'Restaurar exemplos?',
      message: 'Os exercícios de demonstração voltam ao estado original. Seus próprios exercícios não são alterados.',
      confirmLabel: 'Restaurar',
    });
    if (!ok) return;
    const n = restoreDemos();
    toast(`${n} exemplo(s) restaurado(s).`);
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Meus exercícios</h1>
          <div className="mt-1">
            <SyncBadge detailed />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void onRestore()}>
            <RotateCcw size={15} /> Restaurar exemplos
          </Button>
          <Button variant="primary" onClick={() => navigate({ name: 'editor' })}>
            <Plus size={15} /> Novo exercício
          </Button>
        </div>
      </header>

      {userExercises.length === 0 ? (
        <Panel className="p-8 text-center text-sm text-muted">
          Nenhum exercício ainda. Crie um novo, duplique um rudimento ou restaure os exemplos.
        </Panel>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {userExercises.map((ex) => (
            <li key={ex.id}>
              <Panel className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{ex.name}</h2>
                    {ex.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted">{ex.description}</p>}
                  </div>
                  {ex.origin === 'demo' && <span className="shrink-0 rounded-md bg-panel-2 px-2 py-0.5 text-[11px] text-muted">exemplo</span>}
                </div>
                <p className="tabular text-xs text-muted">
                  {formatTimeSignature(ex.tempoSignature)} · {ex.totalBars} compasso{ex.totalBars > 1 ? 's' : ''} · {ex.bpm} BPM ·{' '}
                  {ex.events.length} notas · atualizado {dateFmt.format(ex.updatedAt)}
                </p>
                {ex.totalBars <= 4 && <MiniPattern exercise={ex} />}
                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      practice.select(ex.id);
                      navigate({ name: 'practice' });
                    }}
                  >
                    <Play size={14} /> Praticar
                  </Button>
                  <Button size="sm" onClick={() => navigate({ name: 'editor', id: ex.id })}>
                    <PencilLine size={14} /> Editar
                  </Button>
                  <Button size="sm" onClick={() => void onRename(ex)}>
                    <TextCursorInput size={14} /> Renomear
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      const copy = duplicate(ex);
                      toast(`"${copy.name}" criado.`);
                    }}
                  >
                    <CopyPlus size={14} /> Duplicar
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void onDelete(ex)} aria-label={`Excluir ${ex.name}`}>
                    <Trash2 size={14} /> Excluir
                  </Button>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
