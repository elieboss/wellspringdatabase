import { useRef, useState } from 'react';
import { PEOPLE, ROOMS, STATUSES, VENDORS, category, person, room, vendor } from '../data.js';
import { isOpen, statusIndex } from '../store.js';
import {
  Alert, Button, Card, ErrorSummary, Field, LinkButton, ScreenHeader, StatusPill, StatusSteps,
  Timeline, UrgencyTag, describedBy, formatDate, go, inputClass
} from '../ui.jsx';

const STAFF_LABEL = 'Facilities staff only';
const URGENCY_RANK = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
const STAFF = PEOPLE.filter((p) => p.type === 'Staff');
const TODAY = new Date().toISOString().slice(0, 10);

// ------------------------------------------------------------
// S1 — Staff sign-in: only Staff accounts can open the queue
// ------------------------------------------------------------
export function StaffSignIn({ dispatch, next }) {
  const [refused, setRefused] = useState(null);

  const choose = (p) => {
    if (p.type !== 'Staff') {
      setRefused(p);
      return;
    }
    dispatch({ type: 'signIn', personId: p.id });
    go(next || '/staff');
  };

  return (
    <>
      <ScreenHeader code="S1" title="Sign in to the staff view" role="Staff" roleLabel={STAFF_LABEL}>
        The maintenance queue shows every report, who handles it and what vendors cost, so only Wellspring staff can open it.
        In this prototype, choose an account to sign in as.
      </ScreenHeader>

      {refused && (
        <div className="mb-6">
          <Alert
            title={`${refused.name} can't open the staff view`}
            action={<LinkButton to="/" variant="secondary">Go to reporting</LinkButton>}
          >
            {refused.name} has a {refused.type} account. Volunteers and board members can report problems and track their own reports.
            Choose a staff account below, or ask a staff member for help.
          </Alert>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {PEOPLE.map((p) => (
          <button key={p.id} type="button" onClick={() => choose(p)}
            className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4 text-left transition hover:border-brand-500 hover:shadow-md">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full font-bold ${p.type === 'Staff' ? 'bg-brand-600 text-white' : 'bg-line text-muted'}`} aria-hidden="true">
              {p.name.split(' ').map((n) => n[0]).join('')}
            </span>
            <span>
              <span className="block font-bold">{p.name}</span>
              <span className="block text-sm text-muted">{p.type} · {p.role}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------
// S2 — Maintenance queue: every report, most urgent first
// ------------------------------------------------------------
const TABS = ['Open', ...STATUSES, 'All'];

export function StaffQueue({ state }) {
  const [tab, setTab] = useState('Open');
  const [roomId, setRoomId] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);

  const matchesTab = (r, t) => (t === 'All' ? true : t === 'Open' ? isOpen(r) : r.status === t);
  const rows = state.requests
    .filter((r) => matchesTab(r, tab))
    .filter((r) => !roomId || r.roomId === Number(roomId))
    .filter((r) => !onlyMine || r.assignedTo === state.staffId)
    .sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || a.reportedAt.localeCompare(b.reportedAt));

  return (
    <>
      <ScreenHeader code="S2" title="Maintenance queue" role="Staff" roleLabel={STAFF_LABEL}>
        Open reports, most urgent first. Choose one to assign it, call a vendor, or resolve it.
      </ScreenHeader>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {TABS.map((t) => {
          const count = state.requests.filter((r) => matchesTab(r, t)).length;
          return (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition ${tab === t ? 'bg-brand-600 text-white' : 'bg-white text-ink ring-1 ring-inset ring-line hover:ring-brand-500'}`}>
              {t} <span className={tab === t ? 'text-brand-100' : 'text-muted'}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2 font-bold">
          Room
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="rounded-md border border-line bg-white px-2 py-1.5 font-normal">
            <option value="">All rooms</option>
            {ROOMS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 font-bold">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          Only mine
        </label>
      </div>

      <Card className="p-0 sm:p-0">
        {rows.length === 0 && <p className="p-6 text-center text-muted">No reports match these filters.</p>}
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id}>
              <a href={`#/staff/request/${r.id}`} className="grid gap-2 p-4 transition hover:bg-brand-50 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    <span className="text-muted">#{r.id}</span> {r.title}
                    {r.isNew && <span className="rounded bg-open-700 px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-white">New</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {room(r.roomId).name} · {category(r.categoryId).name} · reported {formatDate(r.reportedAt)} by {person(r.reportedBy).name}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <UrgencyTag urgency={r.urgency} />
                  <StatusPill status={r.status} />
                  <span className="text-sm text-muted">{r.assignedTo ? person(r.assignedTo).name : 'Unassigned'}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

// ------------------------------------------------------------
// S3 — Request detail: assign, call a vendor, finish, resolve
// ------------------------------------------------------------
export function StaffRequest({ state, dispatch, id }) {
  const r = state.requests.find((x) => x.id === id);
  const [flash, setFlash] = useState(null);
  const jobsRef = useRef(null);

  if (!r) {
    return <Alert title={`Report #${id} doesn't exist`} action={<LinkButton to="/staff">Back to the queue</LinkButton>}>It may have been mistyped. Open it from the queue instead.</Alert>;
  }

  const me = person(state.staffId);
  const done = (message) => {
    setFlash(message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const goToJobs = () => {
    jobsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    jobsRef.current?.querySelector('input')?.focus({ preventScroll: true });
  };

  return (
    <>
      <a href="#/staff" className="text-sm font-bold text-brand-700 hover:underline">← Maintenance queue</a>
      <div className="mt-3">
        <ScreenHeader code="S3" title={`#${r.id} · ${r.title}`} role="Staff" roleLabel={STAFF_LABEL}>
          {room(r.roomId).name} · {category(r.categoryId).name} · reported {formatDate(r.reportedAt)} by {person(r.reportedBy).name}
        </ScreenHeader>
      </div>

      {flash && (
        <div className="mb-4">
          <Alert tone="success" title="Saved" action={<LinkButton to={`/track/${r.id}`} variant="secondary">See what the reporter sees</LinkButton>}>
            {flash}
          </Alert>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={r.status} />
              <UrgencyTag urgency={r.urgency} />
              <span className="text-sm text-muted">
                {r.assignedTo ? <>Assigned to <b className="text-ink">{person(r.assignedTo).name}</b></> : 'Nobody assigned yet'}
              </span>
            </div>
            <div className="mt-4"><StatusSteps status={r.status} /></div>
            <p className="mt-4 whitespace-pre-line">{r.description}</p>
          </Card>

          {isOpen(r) && <StatusForm key={`${r.id}-${r.status}`} request={r} me={me} dispatch={dispatch} onDone={done} goToJobs={goToJobs} />}

          <div ref={jobsRef} className="scroll-mt-24">
            <VendorJobs request={r} me={me} dispatch={dispatch} onDone={done} />
          </div>

          {isOpen(r) && <NoteForm request={r} me={me} dispatch={dispatch} onDone={done} />}
        </div>

        <Card className="h-fit">
          <h2 className="mb-4 font-bold">History</h2>
          <Timeline history={r.history} />
          <p className="mt-4 text-xs text-muted">History entries are permanent; they cannot be edited or deleted.</p>
        </Card>
      </div>
    </>
  );
}

// Status change. The rules match the database: assign before moving
// past Reported (Rule 2), only move forward (Rule 3), and finish every
// vendor job before resolving (Rule 4).
function StatusForm({ request: r, me, dispatch, onDone, goToJobs }) {
  const forward = STATUSES.slice(statusIndex(r.status));
  const suggested = forward[1] ?? r.status;
  const [status, setStatus] = useState(suggested);
  const [assignee, setAssignee] = useState(r.assignedTo ? String(r.assignedTo) : '');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);

  const unfinished = r.jobs.filter((j) => !j.completed);

  const save = (e) => {
    e.preventDefault();
    const assignedTo = assignee ? Number(assignee) : null;
    if (status !== 'Reported' && !assignedTo) {
      setError({ kind: 'assignee', message: `Assign a staff member before moving this report to ${status}.` });
      return;
    }
    if (status === 'Resolved' && unfinished.length) {
      setError({ kind: 'jobs', message: `${vendor(unfinished[0].vendorId).name}'s job ("${unfinished[0].description}") has no completion date yet. Record the finished job before resolving.` });
      return;
    }
    if (status === r.status && assignedTo === r.assignedTo) {
      setError({ kind: 'nochange', message: 'Choose a new status or a different person, or add a note below instead.' });
      return;
    }
    setError(null);
    const who = assignedTo !== r.assignedTo ? ` Assigned to ${person(assignedTo).name}.` : '';
    dispatch({
      type: 'changeStatus', id: r.id, status, assignedTo, by: me.id,
      note: note.trim() || `Status changed to ${status}.${who}`
    });
    setNote('');
    onDone(`#${r.id} is now ${status}${assignedTo ? `, handled by ${person(assignedTo).name}` : ''}.`);
    const nextForward = STATUSES[statusIndex(status) + 1];
    if (nextForward) setStatus(nextForward);
  };

  const recover = {
    assignee: <Button variant="secondary" onClick={() => { setAssignee(String(me.id)); setError(null); document.getElementById('assignee')?.focus(); }}>Assign to me</Button>,
    jobs: <Button variant="secondary" onClick={() => { setError(null); goToJobs(); }}>Record the finished job</Button>,
    nochange: null
  };

  return (
    <Card>
      <h2 className="text-lg font-bold">Update status</h2>
      <p className="text-sm text-muted">Status only moves forward: Reported → Assigned → In Progress → Resolved.</p>
      <form onSubmit={save} noValidate className="mt-4 space-y-4">
        {error && <Alert title="This change can't be saved yet" action={recover[error.kind]}>{error.message}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="status" label="New status">
            <select id="status" className={inputClass(false)} value={status} onChange={(e) => { setStatus(e.target.value); setError(null); }}>
              {forward.map((s) => <option key={s} value={s}>{s}{s === r.status ? ' (current)' : ''}</option>)}
            </select>
          </Field>
          <Field id="assignee" label="Assigned to" error={error?.kind === 'assignee' ? 'Choose a staff member' : null}>
            <select id="assignee" className={inputClass(error?.kind === 'assignee')} value={assignee}
              aria-invalid={error?.kind === 'assignee'} aria-describedby={describedBy('assignee', { error: error?.kind === 'assignee' })}
              onChange={(e) => { setAssignee(e.target.value); setError(null); }}>
              <option value="">Nobody yet</option>
              {STAFF.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.role}){p.id === me.id ? ' – me' : ''}</option>)}
            </select>
          </Field>
        </div>
        <Field id="statusNote" label="Note for the history" optional>
          <input id="statusNote" className={inputClass(false)} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Dimmer pack looks fine; calling a lighting specialist." />
        </Field>
        <Button type="submit">Save status</Button>
      </form>
    </Card>
  );
}

// Vendor jobs: book a vendor for this request, then record when the
// work was finished and what it cost.
function VendorJobs({ request: r, me, dispatch, onDone }) {
  const service = category(r.categoryId).service;
  const [showAll, setShowAll] = useState(false);
  const vendors = VENDORS.filter((v) => v.active && (showAll || v.services.includes(service)));
  const [form, setForm] = useState({ vendorId: '', scheduled: '', description: '' });
  const [errors, setErrors] = useState({});
  const [booking, setBooking] = useState(r.jobs.length === 0 && isOpen(r));

  const book = (e) => {
    e.preventDefault();
    const found = {};
    if (!form.vendorId) found.vendorId = 'Choose a vendor';
    if (!form.scheduled) found.scheduled = 'Choose the date the vendor will come';
    else if (form.scheduled < TODAY) found.scheduled = 'The visit date cannot be in the past';
    if (!form.description.trim()) found.description = 'Describe the work the vendor will do';
    setErrors(found);
    if (Object.keys(found).length) return;
    const v = vendor(Number(form.vendorId));
    dispatch({ type: 'bookJob', id: r.id, vendorId: v.id, vendorName: v.name, scheduled: form.scheduled, scheduledLabel: formatDate(form.scheduled), description: form.description.trim(), by: me.id });
    setForm({ vendorId: '', scheduled: '', description: '' });
    setBooking(false);
    onDone(`${v.name} is booked for ${formatDate(form.scheduled)}. Call ${v.contact || 'them'} on ${v.phone} to confirm.`);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Vendor jobs</h2>
        {isOpen(r) && !booking && <Button variant="secondary" onClick={() => setBooking(true)}>+ Book a vendor</Button>}
      </div>

      {r.jobs.length === 0 && !booking && <p className="mt-2 text-sm text-muted">No vendor needed so far.</p>}

      <div className="mt-4 space-y-3">
        {r.jobs.map((job) => <JobCard key={job.id} job={job} request={r} me={me} dispatch={dispatch} onDone={onDone} />)}
      </div>

      {booking && (
        <form onSubmit={book} noValidate className="mt-4 space-y-4 rounded-xl bg-brand-50 p-4">
          <h3 className="font-bold">Book a vendor</h3>
          <ErrorSummary title="Fix these to book the vendor" errors={errors} />
          <Field id="vendorId" label="Vendor" hint={showAll ? 'All active vendors' : `Active vendors offering ${service}`} error={errors.vendorId}>
            <div className="space-y-2">
              {vendors.map((v) => (
                <label key={v.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-white p-3 has-[:checked]:border-brand-600 has-[:checked]:ring-1 has-[:checked]:ring-brand-600 ${errors.vendorId ? 'border-danger-600' : 'border-line'}`}>
                  <input type="radio" name="vendor" id={v === vendors[0] ? 'vendorId' : undefined} value={v.id}
                    checked={form.vendorId === String(v.id)} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}
                    className="h-4 w-4 accent-brand-600" />
                  <span className="min-w-0">
                    <span className="block font-bold">{v.name}</span>
                    <span className="block text-sm text-muted">{v.services.join(', ')} · {v.contact ? `${v.contact}, ` : ''}{v.phone}</span>
                  </span>
                </label>
              ))}
            </div>
            <button type="button" className="mt-2 text-sm font-bold text-brand-700 underline" onClick={() => setShowAll(!showAll)}>
              {showAll ? `Only show ${service} vendors` : 'Show all active vendors'}
            </button>
          </Field>
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <Field id="scheduled" label="Visit date" error={errors.scheduled}>
              <input id="scheduled" type="date" min={TODAY} className={inputClass(errors.scheduled)} value={form.scheduled}
                aria-invalid={!!errors.scheduled} onChange={(e) => setForm({ ...form, scheduled: e.target.value })} />
            </Field>
            <Field id="description" label="Work to do" error={errors.description}>
              <input id="description" className={inputClass(errors.description)} value={form.description}
                aria-invalid={!!errors.description} placeholder="Inspect and repair the flickering stage spotlights"
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
          <div className="flex gap-3">
            <Button type="submit">Book vendor</Button>
            {r.jobs.length > 0 && <Button variant="quiet" onClick={() => { setBooking(false); setErrors({}); }}>Cancel</Button>}
          </div>
        </form>
      )}
    </Card>
  );
}

function JobCard({ job, request: r, me, dispatch, onDone }) {
  const v = vendor(job.vendorId);
  const [completed, setCompleted] = useState('');
  const [cost, setCost] = useState('');
  const [errors, setErrors] = useState({});
  const ids = { completed: `completed-${job.id}`, cost: `cost-${job.id}` };

  const finish = (e) => {
    e.preventDefault();
    const found = {};
    if (!completed) found[ids.completed] = 'Enter the date the work was finished';
    else if (job.scheduled && completed < job.scheduled) found[ids.completed] = `The finish date cannot be before the visit date (${formatDate(job.scheduled)})`;
    if (cost === '') found[ids.cost] = 'Enter the final cost from the invoice (0 if it was free)';
    else if (Number(cost) < 0) found[ids.cost] = 'The cost cannot be negative';
    setErrors(found);
    if (Object.keys(found).length) return;
    dispatch({ type: 'completeJob', id: r.id, jobId: job.id, completed, completedLabel: formatDate(completed), cost: Number(cost), by: me.id });
    onDone(`${v.name}'s job is recorded as finished. You can now resolve #${r.id}.`);
  };

  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold">{v.name}</p>
          <p className="text-sm text-muted">{job.description}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ring-1 ring-inset ${job.completed ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-open-50 text-open-700 ring-open-200'}`}>
          {job.completed ? 'Finished' : 'Booked'}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div><dt className="text-muted">Visit</dt><dd className="font-semibold">{formatDate(job.scheduled)}</dd></div>
        <div><dt className="text-muted">Finished</dt><dd className="font-semibold">{formatDate(job.completed)}</dd></div>
        <div><dt className="text-muted">Cost</dt><dd className="font-semibold tabular-nums">{job.cost == null ? '—' : `$${job.cost.toFixed(2)}`}</dd></div>
      </dl>

      {!job.completed && isOpen(r) && (
        <form onSubmit={finish} noValidate className="mt-4 border-t border-line pt-4">
          <h3 className="text-sm font-bold">Record the finished job</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-[200px_160px_auto] sm:items-start">
            <Field id={ids.completed} label="Finished on" error={errors[ids.completed]}>
              <input id={ids.completed} type="date" className={inputClass(errors[ids.completed])} value={completed}
                aria-invalid={!!errors[ids.completed]} onChange={(e) => setCompleted(e.target.value)} />
            </Field>
            <Field id={ids.cost} label="Final cost ($)" error={errors[ids.cost]}>
              <input id={ids.cost} type="number" step="0.01" inputMode="decimal" className={inputClass(errors[ids.cost])} value={cost}
                aria-invalid={!!errors[ids.cost]} placeholder="180.00" onChange={(e) => setCost(e.target.value)} />
            </Field>
            <div className="sm:pt-7"><Button type="submit">Save job</Button></div>
          </div>
        </form>
      )}
    </div>
  );
}

function NoteForm({ request: r, me, dispatch, onDone }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const add = (e) => {
    e.preventDefault();
    if (!note.trim()) {
      setError('Write the note first');
      return;
    }
    dispatch({ type: 'addNote', id: r.id, note: note.trim(), by: me.id });
    setNote('');
    setError(null);
    onDone('Your note was added to the history.');
  };
  return (
    <Card>
      <form onSubmit={add} noValidate>
        <Field id="note" label="Add a note" hint="Keeps a record of what happened, without changing the status" error={error}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="note" className={inputClass(error)} value={note} aria-invalid={!!error}
              placeholder="Vendor confirmed by phone for Friday morning." onChange={(e) => { setNote(e.target.value); setError(null); }} />
            <Button type="submit" variant="secondary" className="shrink-0">Add note</Button>
          </div>
        </Field>
      </form>
    </Card>
  );
}
