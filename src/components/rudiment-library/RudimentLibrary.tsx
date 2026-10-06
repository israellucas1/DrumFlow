import { CopyPlus, Play } from 'lucide-react';
import { useExercises, usePractice } from '../../app/AppState';
import { navigate } from '../../app/router';
import { SUBDIVISIONS } from '../../music/instruments';
import type { Exercise } from '../../music/types';
import { Button, Panel } from '../ui/primitives';
import { useFeedback } from '../ui/feedback';
import { MiniPattern } from './MiniPattern';

const SECTIONS = [
  {
    id: 'rudimentos',
    title: 'Rudimentos',
    category: 'rudiment',
    intro: 'Exercícios na caixa, em loop. D = mão direita, E = mão esquerda, letras minúsculas = apojaturas.',
  },
  {
    id: 'gospel',
    title: 'Gospel chops',
    category: 'gospel',
    intro:
      'Combinações lineares de mãos e bumbo, quase sempre em sextinas. D = mão direita, E = mão esquerda, P = pé (bumbo). Comece devagar (50–60 BPM) e só acelere quando o grupo soar igual.',
  },
] as const;

export function RudimentLibrary() {
  const { library, duplicate } = useExercises();
  const practice = usePractice();
  const { toast } = useFeedback();

  const practiceIt = (ex: Exercise) => {
    practice.select(ex.id);
    navigate({ name: 'practice' });
  };
  const duplicateIt = (ex: Exercise) => {
    const copy = duplicate(ex, `${ex.name} (cópia)`);
    toast(`"${copy.name}" adicionado a Meus exercícios.`);
    navigate({ name: 'editor', id: copy.id });
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Biblioteca</h1>
        <p className="text-sm text-muted">Duplicar cria uma cópia editável em "Meus exercícios"; o original não muda.</p>
        <nav aria-label="Seções da biblioteca" className="flex gap-2">
          {SECTIONS.map((s) => (
            <Button key={s.id} size="sm" onClick={() => document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth' })}>
              {s.title}
            </Button>
          ))}
        </nav>
      </header>
      {SECTIONS.map((section) => (
        <section key={section.id} id={`sec-${section.id}`} aria-labelledby={`h-${section.id}`} className="scroll-mt-4">
          <h2 id={`h-${section.id}`} className="text-lg font-semibold tracking-tight">
            {section.title}
          </h2>
          <p className="mb-3 mt-1 text-sm text-muted">{section.intro}</p>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {library
              .filter((e) => e.category === section.category)
              .map((ex) => (
                <li key={ex.id}>
                  <Panel className="flex h-full flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">{ex.name}</h3>
                      <span className="tabular shrink-0 rounded-md bg-panel-2 px-2 py-0.5 text-xs text-muted">{ex.bpm} BPM</span>
                    </div>
                    <p className="text-sm text-muted">{ex.description}</p>
                    <p className="rounded-md border border-line px-2 py-1 font-mono text-[13px] tracking-wide" aria-label={`Sequência: ${ex.sticking}`}>
                      {ex.sticking}
                    </p>
                    <MiniPattern exercise={ex} />
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs text-muted">
                        {SUBDIVISIONS.find((s) => s.id === ex.subdivision)?.label} · {ex.totalBars} comp. ·{' '}
                        {ex.events.filter((e) => e.accent).length} acentos
                      </span>
                      <div className="ml-auto flex gap-2">
                        <Button size="sm" onClick={() => duplicateIt(ex)}>
                          <CopyPlus size={14} /> Duplicar
                        </Button>
                        <Button size="sm" variant="primary" onClick={() => practiceIt(ex)}>
                          <Play size={14} /> Praticar
                        </Button>
                      </div>
                    </div>
                  </Panel>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
