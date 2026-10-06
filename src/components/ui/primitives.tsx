import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:opacity-90 border border-transparent',
  secondary: 'bg-panel-2 text-fg border border-line hover:border-muted/60',
  ghost: 'bg-transparent text-fg border border-transparent hover:bg-panel-2',
  danger: 'bg-transparent text-danger border border-danger/40 hover:bg-danger/10',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3 text-sm gap-2',
  lg: 'h-11 px-4 text-sm gap-2',
  icon: 'h-9 w-9 justify-center',
  'icon-lg': 'h-12 w-12 justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  pressed?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', pressed, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      className={cx(
        'inline-flex shrink-0 items-center rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        pressed && 'bg-primary text-primary-fg border-transparent hover:opacity-90',
        className,
      )}
      {...rest}
    />
  );
});

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cx('flex flex-col gap-1 text-xs text-muted', className)}>
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted/80">{hint}</span>}
    </label>
  );
}

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cx(
        'h-9 rounded-lg border border-line bg-panel-2 px-2.5 text-sm text-fg outline-none hover:border-muted/60 disabled:opacity-40',
        className,
      )}
      {...rest}
    />
  );
});

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cx(
        'h-9 rounded-lg border border-line bg-panel-2 px-2.5 text-sm text-fg outline-none placeholder:text-muted/70 hover:border-muted/60',
        className,
      )}
      {...rest}
    />
  );
});

export function Toggle({
  checked,
  onChange,
  label,
  icon,
  className,
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  icon?: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      onClick={() => onChange(!checked)}
      className={cx(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-2.5 text-sm transition-colors',
        checked ? 'border-transparent bg-primary text-primary-fg' : 'border-line bg-panel-2 text-muted hover:text-fg',
        className,
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  className,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  className?: string;
  format?: (v: number) => string;
}) {
  return (
    <input
      type="range"
      aria-label={label}
      aria-valuetext={format ? format(value) : undefined}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cx('h-2 cursor-pointer', className)}
    />
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-xl border border-line bg-panel', className)}>{children}</section>;
}
