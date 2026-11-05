import { useEffect, useRef } from 'react';
import { STATUSES, person } from './data.js';

export function go(path) {
  window.location.hash = path;
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T12:00` : value);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ------------------------------------------------------------
// Buttons and links
// ------------------------------------------------------------

const BUTTON = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-white text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50',
  quiet: 'text-brand-700 hover:bg-brand-50',
  danger: 'bg-danger-600 text-white hover:bg-danger-700'
};

export function Button({ variant = 'primary', className = '', ...props }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[variant]} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({ to, variant = 'primary', className = '', children }) {
  return (
    <a href={`#${to}`} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition ${BUTTON[variant]} ${className}`}>
      {children}
    </a>
  );
}

// ------------------------------------------------------------
// Labels, pills and cards
// ------------------------------------------------------------

const ROLE_STYLE = {
  Reporter: 'bg-sky-50 text-sky-800 ring-sky-200',
  Staff: 'bg-brand-50 text-brand-800 ring-brand-200'
};

export function RoleTag({ role, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ${ROLE_STYLE[role]}`}>
      <span aria-hidden="true">{role === 'Staff' ? '🔒' : '👤'}</span>
      {children}
    </span>
  );
}

// Every screen opens with its name and who uses it.
export function ScreenHeader({ code, title, role, roleLabel, children }) {
  return (
    <div className="mb-6">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
        <span>Screen {code}</span>
        <RoleTag role={role}>{roleLabel}</RoleTag>
      </div>
      <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      {children && <p className="mt-1 max-w-2xl text-muted">{children}</p>}
    </div>
  );
}

const STATUS_STYLE = {
  Reported: 'bg-open-50 text-open-700 ring-open-200',
  Assigned: 'bg-sky-50 text-sky-800 ring-sky-200',
  'In Progress': 'bg-violet-50 text-violet-800 ring-violet-200',
  Resolved: 'bg-brand-50 text-brand-700 ring-brand-200'
};

export function StatusPill({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-extrabold whitespace-nowrap ring-1 ring-inset ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

const URGENCY_STYLE = {
  Urgent: 'text-danger-700 bg-danger-50 ring-danger-200',
  High: 'text-open-700 bg-open-50 ring-open-200',
  Medium: 'text-ink bg-white ring-line',
  Low: 'text-muted bg-white ring-line'
};

export function UrgencyTag({ urgency }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${URGENCY_STYLE[urgency]}`}>
      {urgency}
    </span>
  );
}

export function Card({ className = '', children, ...props }) {
  return (
    <section className={`rounded-2xl border border-line bg-white p-5 shadow-[0_2px_10px_rgba(23,59,44,0.05)] sm:p-6 ${className}`} {...props}>
      {children}
    </section>
  );
}

// Reported -> Assigned -> In Progress -> Resolved, with the current step marked.
export function StatusSteps({ status }) {
  const current = STATUSES.indexOf(status);
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label={`Status: ${status}`}>
      {STATUSES.map((step, i) => (
        <li key={step} className="min-w-0">
          <div className={`h-1.5 rounded-full ${i <= current ? 'bg-brand-600' : 'bg-line'}`} />
          <p className={`mt-1.5 truncate text-xs ${i === current ? 'font-extrabold text-ink' : i < current ? 'font-semibold text-brand-700' : 'text-muted'}`}>
            {i < current ? '✓ ' : ''}{step}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function Timeline({ history }) {
  return (
    <ol className="relative space-y-4 border-l-2 border-line pl-5">
      {history.map((entry, i) => (
        <li key={i} className="relative">
          <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${entry.status ? 'bg-brand-600' : 'bg-line'}`} aria-hidden="true" />
          <p className="text-xs text-muted">
            {formatDateTime(entry.at)} · {person(entry.by)?.name}
          </p>
          <p className="mt-0.5 text-sm">
            {entry.status && <><StatusPill status={entry.status} /> </>}
            {entry.note}
          </p>
        </li>
      ))}
    </ol>
  );
}

// ------------------------------------------------------------
// Form fields and errors
// ------------------------------------------------------------

export function Field({ id, label, hint, error, optional, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold">
        {label} {optional && <span className="font-normal text-muted">(optional)</span>}
      </label>
      {hint && <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1 flex items-start gap-1.5 text-sm font-bold text-danger-600">
          <span aria-hidden="true">⚠</span>{error}
        </p>
      )}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export function inputClass(error) {
  return `block w-full rounded-lg border bg-white px-3 py-2.5 text-base shadow-sm outline-none transition focus:ring-2 ${
    error ? 'border-danger-600 ring-1 ring-danger-600 focus:ring-danger-200' : 'border-line focus:border-brand-500 focus:ring-brand-200'
  }`;
}

export function describedBy(id, { hint, error }) {
  return [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
}

// A list of everything to fix, linked to each field. It takes focus
// when it appears so keyboard and screen-reader users hear it.
export function ErrorSummary({ title = 'Fix the following to continue', errors }) {
  const ref = useRef(null);
  const entries = Object.entries(errors).filter(([, message]) => message);
  useEffect(() => {
    if (entries.length) ref.current?.focus();
  }, [entries.length]);
  if (!entries.length) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="mb-6 rounded-xl border-2 border-danger-600 bg-danger-50 p-4">
      <h2 className="font-bold text-danger-700">{title}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        {entries.map(([field, message]) => (
          <li key={field}>
            <a href={`#${field}`} onClick={(e) => { e.preventDefault(); document.getElementById(field)?.focus(); }} className="font-semibold text-danger-700 underline">
              {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A one-line problem with a way out.
export function Alert({ tone = 'danger', title, children, action }) {
  const styles = {
    danger: 'border-danger-600 bg-danger-50 text-danger-700',
    success: 'border-brand-600 bg-brand-50 text-brand-800',
    info: 'border-sky-300 bg-sky-50 text-sky-900'
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`flex flex-col gap-3 rounded-xl border-l-4 p-4 sm:flex-row sm:items-center sm:justify-between ${styles[tone]}`}>
      <div>
        {title && <p className="font-bold">{title}</p>}
        <div className="text-sm text-ink">{children}</div>
      </div>
      {action && <div className="shrink-0 [&>*]:whitespace-nowrap">{action}</div>}
    </div>
  );
}
