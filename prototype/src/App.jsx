import { useEffect, useReducer, useState } from 'react';
import { loadState, reducer, saveState } from './store.js';
import { person } from './data.js';
import { Alert, Button, LinkButton, RoleTag } from './ui.jsx';
import { ReportForm, ReportSent, ReporterHome, ReviewReport, TrackRequest } from './screens/Reporter.jsx';
import { StaffQueue, StaffRequest, StaffSignIn } from './screens/Staff.jsx';

// Hash routes (#/report, #/staff/request/10) work on GitHub Pages
// without any server set-up, and every screen has its own link.
function useHashPath() {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [path, setPath] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setPath(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

// The workflow, in order, for the prototype guide.
const GUIDE = [
  { code: 'R1', role: 'Reporter', path: '/', title: 'Reporter home', what: 'Starting point. Primary action: Report a problem.' },
  { code: 'R2', role: 'Reporter', path: '/report', title: 'Report form', what: 'Enter title, room, kind, urgency and description.', error: 'Press Continue with fields empty: errors are listed and each field is marked. Fill them in to recover.' },
  { code: 'R3', role: 'Reporter', path: '/review', title: 'Review and send', what: 'Review the answers, with a warning if the room already has open reports.', error: 'The first Send fails (connection dropped). Answers are kept; press Try again.' },
  { code: 'R4', role: 'Reporter', path: '/sent', title: 'Report sent', what: 'Confirmation with the report number and what happens next.' },
  { code: 'S1', role: 'Staff', path: '/staff/signin', title: 'Staff sign-in', what: 'Only staff accounts can open the queue.', error: 'Choose Priya Shah (Volunteer): access is refused, with a way back.' },
  { code: 'S2', role: 'Staff', path: '/staff', title: 'Maintenance queue', what: 'All reports, most urgent first. The new report is marked New.' },
  { code: 'S3', role: 'Staff', path: null, title: 'Request detail', what: 'Assign, book a vendor, record the finished job, resolve.', error: 'Save "Assigned" with nobody chosen, or Resolve while the vendor job is unfinished: the error offers the fix (Assign to me / Record the finished job).' },
  { code: 'R5', role: 'Reporter', path: null, title: 'Track my report', what: 'The reporter sees the new status and the full history.' }
];

function Guide({ state, dispatch, path, onClose }) {
  const newest = state.lastCreatedId ?? 9;
  const linkFor = (step) => step.path ?? (step.code === 'S3' ? `/staff/request/${newest}` : `/track/${newest}`);
  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col overflow-y-auto border-l border-line bg-white shadow-2xl" aria-label="Prototype guide">
      <div className="sticky top-0 flex items-center justify-between border-b border-line bg-white px-5 py-4">
        <h2 className="text-lg font-bold">Prototype guide</h2>
        <Button variant="quiet" onClick={onClose} aria-label="Close guide">✕ Close</Button>
      </div>
      <div className="space-y-6 px-5 py-5">
        <p className="text-sm text-muted">
          One complete workflow: a problem is reported, facilities staff handle it, and the reporter sees it resolved.
          Follow the screens in order, or jump to any of them.
        </p>
        <ol className="space-y-3">
          {GUIDE.map((step) => {
            const to = linkFor(step);
            const current = path === to;
            return (
              <li key={step.code}>
                <a href={`#${to}`} onClick={onClose}
                  className={`block rounded-xl border p-3 transition hover:border-brand-500 ${current ? 'border-brand-600 bg-brand-50' : 'border-line'}`}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold text-muted">{step.code}</span>
                    <span className="font-bold">{step.title}</span>
                    <RoleTag role={step.role}>{step.role === 'Staff' ? 'Staff only' : 'Reporter'}</RoleTag>
                  </span>
                  <span className="mt-1 block text-sm">{step.what}</span>
                  {step.error && <span className="mt-1 block text-sm text-danger-700"><b>Error to try:</b> {step.error}</span>}
                </a>
              </li>
            );
          })}
        </ol>

        <div className="space-y-3 rounded-xl bg-ground p-4">
          <h3 className="font-bold">Prototype settings</h3>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={state.simulateFailure}
              onChange={(e) => dispatch({ type: 'setSimulateFailure', value: e.target.checked })} />
            <span><b>Fail the next Send</b> to show the connection error on R3.</span>
          </label>
          <Button variant="secondary" onClick={() => { dispatch({ type: 'reset' }); window.location.hash = '/'; onClose(); }}>
            Reset the prototype
          </Button>
          <p className="text-xs text-muted">Reset restores the sample data and signs staff out. Your progress is otherwise kept in this browser.</p>
        </div>
      </div>
    </aside>
  );
}

function route(path, state, dispatch) {
  const staffOnly = (screen) => (state.staffId ? screen : <StaffSignIn dispatch={dispatch} next={path === '/staff/signin' ? '/staff' : path} />);
  let m;
  if (path === '/') return <ReporterHome state={state} dispatch={dispatch} />;
  if (path === '/report') return <ReportForm state={state} dispatch={dispatch} />;
  if (path === '/review') return <ReviewReport state={state} dispatch={dispatch} />;
  if (path === '/sent') return <ReportSent state={state} />;
  if ((m = path.match(/^\/track\/(\d+)$/))) return <TrackRequest state={state} id={Number(m[1])} />;
  if (path === '/staff/signin') return <StaffSignIn dispatch={dispatch} next="/staff" />;
  if (path === '/staff') return staffOnly(<StaffQueue state={state} />);
  if ((m = path.match(/^\/staff\/request\/(\d+)$/))) {
    const id = Number(m[1]);
    return staffOnly(<StaffRequest key={id} state={state} dispatch={dispatch} id={id} />);
  }
  return <Alert title="This page doesn't exist" action={<LinkButton to="/">Go to the start</LinkButton>}>The link may be mistyped.</Alert>;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [guideOpen, setGuideOpen] = useState(false);
  const path = useHashPath();
  const inStaff = path.startsWith('/staff');
  const staff = person(state.staffId);

  useEffect(() => saveState(state), [state]);

  return (
    <div className="min-h-screen bg-ground pb-16">
      <div className="bg-brand-800 px-4 py-2 text-center text-xs font-semibold text-brand-100">
        Prototype · sample data only · nothing is sent anywhere
        <button type="button" onClick={() => setGuideOpen(true)} className="ml-3 rounded bg-white/15 px-2 py-0.5 font-bold text-white hover:bg-white/25">
          Open the prototype guide
        </button>
      </div>

      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <a href="#/" className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 font-display text-lg font-bold text-white" aria-hidden="true">W</span>
            <span className="leading-tight">
              <span className="block font-display text-lg font-bold">Wellspring</span>
              <span className="block text-xs font-bold uppercase tracking-wider text-muted">Maintenance</span>
            </span>
          </a>

          <nav className="flex items-center gap-1 rounded-xl bg-ground p-1 text-sm font-bold" aria-label="Choose a view">
            <a href="#/" aria-current={!inStaff ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 ${!inStaff ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
              👤 Report a problem
            </a>
            <a href="#/staff" aria-current={inStaff ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 ${inStaff ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
              🔒 Staff queue
            </a>
          </nav>

          {inStaff && staff && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">Signed in as <b className="text-ink">{staff.name}</b></span>
              <Button variant="quiet" className="px-2 py-1" onClick={() => { dispatch({ type: 'signOut' }); window.location.hash = '/staff/signin'; }}>Sign out</Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {route(path, state, dispatch)}
      </main>

      {guideOpen && (
        <>
          <div className="fixed inset-0 z-20 bg-ink/30" onClick={() => setGuideOpen(false)} aria-hidden="true" />
          <Guide state={state} dispatch={dispatch} path={path} onClose={() => setGuideOpen(false)} />
        </>
      )}
    </div>
  );
}
