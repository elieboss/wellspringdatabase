import { useState } from 'react';
import { CATEGORIES, PEOPLE, ROOMS, URGENCIES, category, person, room } from '../data.js';
import { isOpen } from '../store.js';
import {
  Alert, Button, Card, ErrorSummary, Field, LinkButton, ScreenHeader, StatusPill, StatusSteps,
  Timeline, UrgencyTag, describedBy, formatDate, go, inputClass
} from '../ui.jsx';

const REPORTER_LABEL = 'Reporter · staff, volunteers, board';

// ------------------------------------------------------------
// R1 — Reporter home: the starting point and primary action
// ------------------------------------------------------------
export function ReporterHome({ state, dispatch }) {
  const me = person(state.reporterId);
  const mine = state.requests.filter((r) => r.reportedBy === me.id);

  return (
    <>
      <ScreenHeader code="R1" title={`Hi ${me.name.split(' ')[0]}, spotted a problem?`} role="Reporter" roleLabel={REPORTER_LABEL}>
        Tell facilities about anything broken in a Wellspring room. You can follow every report until it is fixed.
      </ScreenHeader>

      <Card className="flex flex-col gap-5 border-brand-200 bg-gradient-to-br from-white to-brand-50 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Report a maintenance problem</h2>
          <p className="mt-1 text-muted">Takes about a minute: what is wrong, where, and how urgent it is.</p>
        </div>
        <LinkButton to="/report" className="px-6 py-3 text-base">Report a problem →</LinkButton>
      </Card>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-bold">My reports</h2>
        <label className="text-sm text-muted">
          Reporting as{' '}
          <select
            className="ml-1 rounded-md border border-line bg-white px-2 py-1 font-semibold text-ink"
            value={me.id}
            onChange={(e) => dispatch({ type: 'setReporter', personId: Number(e.target.value) })}
          >
            {PEOPLE.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.type})</option>)}
          </select>
        </label>
      </div>

      <div className="mt-3 space-y-3">
        {mine.length === 0 && (
          <Card className="text-center text-muted">You have not reported anything yet. Your reports will appear here.</Card>
        )}
        {mine.map((r) => (
          <a key={r.id} href={`#/track/${r.id}`} className="block rounded-2xl border border-line bg-white p-4 transition hover:border-brand-500 hover:shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold">#{r.id} · {r.title}</p>
              <StatusPill status={r.status} />
            </div>
            <p className="mt-1 text-sm text-muted">{room(r.roomId).name} · reported {formatDate(r.reportedAt)}</p>
          </a>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------
// R2 — Report form: the information the user enters
// ------------------------------------------------------------
export function validateDraft(draft) {
  const errors = {};
  if (!draft.title.trim()) errors.title = 'Enter a short title, for example "Stage lights flickering"';
  if (!draft.roomId) errors.roomId = 'Choose the room where the problem is';
  if (!draft.categoryId) errors.categoryId = 'Choose what kind of problem it is';
  if (!draft.urgency) errors.urgency = 'Choose how urgent it is';
  if (draft.description.trim().length < 10) errors.description = 'Describe what is wrong in at least 10 characters';
  return errors;
}

export function ReportForm({ state, dispatch }) {
  const draft = state.draft;
  const [errors, setErrors] = useState({});
  const [tried, setTried] = useState(false);
  const set = (fields) => {
    dispatch({ type: 'updateDraft', fields });
    // Once the user has tried to continue, clear each error as it is fixed.
    if (tried) setErrors(validateDraft({ ...draft, ...fields }));
  };

  const next = (e) => {
    e.preventDefault();
    const found = validateDraft(draft);
    setTried(true);
    setErrors(found);
    if (Object.keys(found).length === 0) go('/review');
  };

  return (
    <>
      <a href="#/" className="text-sm font-bold text-brand-700 hover:underline">← Back</a>
      <div className="mt-3">
        <ScreenHeader code="R2" title="What's the problem?" role="Reporter" roleLabel={REPORTER_LABEL}>
          Step 1 of 2. All fields are required.
        </ScreenHeader>
      </div>

      <ErrorSummary title="Some information is missing" errors={errors} />

      <Card>
        <form onSubmit={next} noValidate className="space-y-6">
          <Field id="title" label="Short title" hint="Shown in lists, so keep it brief" error={errors.title}>
            <input id="title" className={inputClass(errors.title)} maxLength={120} value={draft.title}
              aria-invalid={!!errors.title} aria-describedby={describedBy('title', { hint: 1, error: errors.title })}
              placeholder="Stage lights flickering" onChange={(e) => set({ title: e.target.value })} />
          </Field>

          <div className="grid gap-6 sm:grid-cols-2">
            <Field id="roomId" label="Room" error={errors.roomId}>
              <select id="roomId" className={inputClass(errors.roomId)} value={draft.roomId}
                aria-invalid={!!errors.roomId} aria-describedby={describedBy('roomId', { error: errors.roomId })}
                onChange={(e) => set({ roomId: e.target.value })}>
                <option value="">Choose a room…</option>
                {ROOMS.map((r) => <option key={r.id} value={r.id}>{r.name} (floor {r.floor})</option>)}
              </select>
            </Field>

            <Field id="categoryId" label="Kind of problem" error={errors.categoryId}>
              <select id="categoryId" className={inputClass(errors.categoryId)} value={draft.categoryId}
                aria-invalid={!!errors.categoryId} aria-describedby={describedBy('categoryId', { error: errors.categoryId })}
                onChange={(e) => set({ categoryId: e.target.value })}>
                <option value="">Choose a kind…</option>
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}: {c.hint}</option>)}
              </select>
            </Field>
          </div>

          <fieldset aria-describedby={errors.urgency ? 'urgency-error' : undefined}>
            <legend className="text-sm font-bold">How urgent is it?</legend>
            {errors.urgency && (
              <p id="urgency-error" className="mt-1 text-sm font-bold text-danger-600">⚠ {errors.urgency}</p>
            )}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {URGENCIES.map((u, i) => (
                <label key={u.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 ${errors.urgency ? 'border-danger-600' : 'border-line hover:border-brand-500'}`}>
                  <input id={i === 0 ? 'urgency' : undefined} type="radio" name="urgency" value={u.value}
                    checked={draft.urgency === u.value} onChange={() => set({ urgency: u.value })}
                    className="mt-1 h-4 w-4 accent-brand-600" />
                  <span>
                    <span className="block font-bold">{u.value}</span>
                    <span className="block text-sm text-muted">{u.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field id="description" label="What is wrong?" hint="What you saw or heard, and when it happens" error={errors.description}>
            <textarea id="description" rows={4} className={inputClass(errors.description)} maxLength={2000} value={draft.description}
              aria-invalid={!!errors.description} aria-describedby={describedBy('description', { hint: 1, error: errors.description })}
              placeholder="Two stage spotlights flicker during rehearsals. A concert is booked for Saturday."
              onChange={(e) => set({ description: e.target.value })} />
          </Field>

          <div className="flex flex-wrap gap-3 border-t border-line pt-5">
            <Button type="submit" className="px-6">Continue to review →</Button>
            <LinkButton to="/" variant="quiet">Cancel</LinkButton>
          </div>
        </form>
      </Card>
    </>
  );
}

// ------------------------------------------------------------
// R3 — Review and send: the user reviews before submitting
// ------------------------------------------------------------
export function ReviewReport({ state, dispatch }) {
  const draft = state.draft;
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  // Arriving here without a complete draft (e.g. after a refresh): go back to the form.
  if (Object.keys(validateDraft(draft)).length) {
    return (
      <Alert title="Your report is not finished yet" action={<LinkButton to="/report">Go to the form</LinkButton>}>
        Complete the form first, then review it here.
      </Alert>
    );
  }

  const chosenRoom = room(Number(draft.roomId));
  const openHere = state.requests.filter((r) => r.roomId === chosenRoom.id && isOpen(r));

  const send = () => {
    setSending(true);
    setFailed(false);
    setTimeout(() => {
      setSending(false);
      if (state.simulateFailure) {
        dispatch({ type: 'submitFailed' });
        setFailed(true);
        return;
      }
      dispatch({ type: 'submitReport' });
      go('/sent');
    }, 700);
  };

  const rows = [
    ['Title', draft.title],
    ['Room', `${chosenRoom.name} (floor ${chosenRoom.floor})`],
    ['Kind of problem', category(Number(draft.categoryId)).name],
    ['Urgency', <UrgencyTag key="u" urgency={draft.urgency} />],
    ['What is wrong', draft.description],
    ['Reported by', person(state.reporterId).name]
  ];

  return (
    <>
      <a href="#/report" className="text-sm font-bold text-brand-700 hover:underline">← Back to the form</a>
      <div className="mt-3">
        <ScreenHeader code="R3" title="Check your report" role="Reporter" roleLabel={REPORTER_LABEL}>
          Step 2 of 2. Nothing is sent until you press Send report.
        </ScreenHeader>
      </div>

      {failed && (
        <div className="mb-6">
          <Alert
            title="We couldn't send your report"
            action={<Button onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Try again'}</Button>}
          >
            The connection to Wellspring's system dropped. Your answers are still here, so nothing is lost. Press Try again.
          </Alert>
        </div>
      )}

      <Card>
        <dl className="divide-y divide-line">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
              <dt className="text-sm font-bold text-muted">{label}</dt>
              <dd className="whitespace-pre-line">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-2">
          <a href="#/report" className="text-sm font-bold text-brand-700 underline">Change these answers</a>
        </div>
      </Card>

      {openHere.length > 0 && (
        <div className="mt-4">
          <Alert tone="info" title={`${openHere.length} open ${openHere.length === 1 ? 'report' : 'reports'} already in the ${chosenRoom.name}`}>
            {openHere.map((r) => `#${r.id} ${r.title} (${r.status})`).join(' · ')}. If yours is the same problem, you don't need to report it again.
          </Alert>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={send} disabled={sending} className="px-6 py-3 text-base">
          {sending ? 'Sending…' : 'Send report'}
        </Button>
        <LinkButton to="/report" variant="secondary">Edit</LinkButton>
      </div>
    </>
  );
}

// ------------------------------------------------------------
// R4 — Report sent: what happens after a successful action
// ------------------------------------------------------------
export function ReportSent({ state }) {
  const request = state.requests.find((r) => r.id === state.lastCreatedId);
  if (!request) {
    return <Alert tone="info" title="No new report" action={<LinkButton to="/report">Report a problem</LinkButton>}>Send a report to see this confirmation.</Alert>;
  }

  return (
    <>
      <ScreenHeader code="R4" title="Report sent" role="Reporter" roleLabel={REPORTER_LABEL} />
      <Card className="border-brand-200">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-600 text-2xl text-white" aria-hidden="true">✓</span>
          <div>
            <p className="text-lg font-bold">Thanks! Your report is number #{request.id}.</p>
            <p className="mt-1 text-muted">
              "{request.title}" in the {room(request.roomId).name} is now in the facilities queue with status <StatusPill status="Reported" />.
            </p>
          </div>
        </div>

        <h2 className="mt-6 font-bold">What happens next</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            ['1', 'A staff member takes it', 'Status becomes Assigned, so you know who to ask.'],
            ['2', 'They fix it or call a vendor', 'Status becomes In Progress. Every step is recorded.'],
            ['3', "It's marked Resolved", 'You can see when it was fixed, and the room can be booked.']
          ].map(([n, title, text]) => (
            <li key={n} className="rounded-xl bg-brand-50 p-4">
              <p className="text-xs font-extrabold text-brand-700">STEP {n}</p>
              <p className="font-bold">{title}</p>
              <p className="text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton to={`/track/${request.id}`}>Track this report</LinkButton>
          <LinkButton to="/report" variant="secondary">Report another problem</LinkButton>
        </div>
      </Card>

      <p className="mt-6 text-sm text-muted">
        Prototype tip: switch to the <a className="font-bold text-brand-700 underline" href="#/staff">staff view</a> to see this report arrive in the facilities queue.
      </p>
    </>
  );
}

// ------------------------------------------------------------
// R5 — Track a report: the reporter sees the updated status
// ------------------------------------------------------------
export function TrackRequest({ state, id }) {
  const r = state.requests.find((x) => x.id === id);
  if (!r) {
    return <Alert title={`We can't find report #${id}`} action={<LinkButton to="/">Go to my reports</LinkButton>}>Check the number, or open it from My reports.</Alert>;
  }
  const assignee = person(r.assignedTo);

  return (
    <>
      <a href="#/" className="text-sm font-bold text-brand-700 hover:underline">← My reports</a>
      <div className="mt-3">
        <ScreenHeader code="R5" title={`#${r.id} · ${r.title}`} role="Reporter" roleLabel={REPORTER_LABEL}>
          {room(r.roomId).name} · {category(r.categoryId).name} · reported {formatDate(r.reportedAt)}
        </ScreenHeader>
      </div>

      {r.status === 'Resolved' && (
        <div className="mb-4">
          <Alert tone="success" title="Fixed!">
            Resolved on {formatDate(r.resolvedAt)}. The {room(r.roomId).name} is ready to use.
          </Alert>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Status</h2>
          <StatusPill status={r.status} />
        </div>
        <div className="mt-3"><StatusSteps status={r.status} /></div>
        <p className="mt-4 text-sm">
          {assignee ? <>Handled by <b>{assignee.name}</b> ({assignee.role}).</> : 'Waiting for a staff member to take it.'}
        </p>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-4 font-bold">History</h2>
        <Timeline history={r.history} />
      </Card>
    </>
  );
}
