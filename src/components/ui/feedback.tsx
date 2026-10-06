import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './primitives';

// ───────────── Diálogo de confirmação (promessa) ─────────────

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface PromptOptions {
  title: string;
  label: string;
  initial: string;
  confirmLabel?: string;
}

interface DialogState {
  kind: 'confirm' | 'prompt';
  opts: ConfirmOptions & Partial<PromptOptions>;
  resolve: (v: boolean | string | null) => void;
}

interface FeedbackApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
  toast: (message: string, tone?: 'info' | 'error') => void;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('FeedbackProvider ausente');
  return ctx;
}

interface ToastItem {
  id: number;
  message: string;
  tone: 'info' | 'error';
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setDialog({ kind: 'confirm', opts, resolve: (v) => resolve(v === true) })),
    [],
  );
  const prompt = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) =>
        setDialog({ kind: 'prompt', opts, resolve: (v) => resolve(typeof v === 'string' ? v : null) }),
      ),
    [],
  );
  const toast = useCallback((message: string, tone: 'info' | 'error' = 'info') => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const close = (v: boolean | string | null) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <FeedbackContext.Provider value={{ confirm, prompt, toast }}>
      {children}
      {dialog && <Dialog state={dialog} onClose={close} />}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto rounded-lg border px-4 py-2 text-sm shadow-lg ${
              t.tone === 'error' ? 'border-danger/50 bg-panel text-danger' : 'border-line bg-panel text-fg'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

function Dialog({ state, onClose }: { state: DialogState; onClose: (v: boolean | string | null) => void }) {
  const { opts, kind } = state;
  const [value, setValue] = useState(opts.initial ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (kind === 'prompt') inputRef.current?.select();
    else confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(kind === 'prompt' ? null : false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kind, onClose]);

  const submit = () => onClose(kind === 'prompt' ? value : true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={() => onClose(kind === 'prompt' ? null : false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="df-dialog-title"
        className="w-full max-w-sm rounded-xl border border-line bg-panel p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="df-dialog-title" className="text-base font-semibold">
          {opts.title}
        </h2>
        {opts.message && <p className="mt-2 text-sm text-muted">{opts.message}</p>}
        {kind === 'prompt' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label className="mt-3 flex flex-col gap-1 text-xs text-muted">
              {opts.label}
              <input
                ref={inputRef}
                value={value}
                maxLength={120}
                onChange={(e) => setValue(e.target.value)}
                className="h-9 rounded-lg border border-line bg-panel-2 px-2.5 text-sm text-fg outline-none"
              />
            </label>
          </form>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onClose(kind === 'prompt' ? null : false)}>
            {opts.cancelLabel ?? 'Cancelar'}
          </Button>
          <Button ref={confirmRef} variant={opts.danger ? 'danger' : 'primary'} onClick={submit}>
            {opts.confirmLabel ?? 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
