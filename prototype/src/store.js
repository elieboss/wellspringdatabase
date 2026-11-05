// Prototype state: one reducer holds every request, the signed-in
// staff member, the reporter's draft and the prototype settings.
// It is saved to localStorage so a refresh keeps your progress.

import { INITIAL_REQUESTS, STATUSES } from './data.js';

const STORAGE_KEY = 'wellspring-prototype-v1';

const EMPTY_DRAFT = { title: '', roomId: '', categoryId: '', urgency: '', description: '' };

export function initialState() {
  return {
    requests: INITIAL_REQUESTS,
    reporterId: 4,          // Priya Shah, volunteer
    staffId: null,          // nobody signed in to the staff view yet
    draft: EMPTY_DRAFT,
    simulateFailure: true,  // the first "Send" fails, to show recovery
    lastCreatedId: null
  };
}

export function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.requests)) return saved;
  } catch {
    // Private windows or blocked storage: start fresh.
  }
  return initialState();
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage is a convenience only.
  }
}

const nowIso = () => new Date().toISOString().slice(0, 16);

function updateRequest(state, id, change) {
  return {
    ...state,
    requests: state.requests.map((r) => (r.id === id ? change(r) : r))
  };
}

function withHistory(request, entry) {
  return { ...request, history: [...request.history, { at: nowIso(), ...entry }] };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'reset':
      return initialState();

    case 'setReporter':
      return { ...state, reporterId: action.personId };

    case 'signIn':
      return { ...state, staffId: action.personId };

    case 'signOut':
      return { ...state, staffId: null };

    case 'setSimulateFailure':
      return { ...state, simulateFailure: action.value };

    case 'updateDraft':
      return { ...state, draft: { ...state.draft, ...action.fields } };

    case 'submitFailed':
      // Only the first attempt fails; "Try again" then works.
      return { ...state, simulateFailure: false };

    case 'submitReport': {
      const id = Math.max(...state.requests.map((r) => r.id)) + 1;
      const d = state.draft;
      const request = {
        id,
        title: d.title.trim(),
        roomId: Number(d.roomId),
        categoryId: Number(d.categoryId),
        urgency: d.urgency,
        description: d.description.trim(),
        status: 'Reported',
        reportedBy: state.reporterId,
        assignedTo: null,
        reportedAt: nowIso(),
        resolvedAt: null,
        history: [{ at: nowIso(), by: state.reporterId, status: 'Reported', note: 'Problem reported.' }],
        jobs: [],
        isNew: true
      };
      return { ...state, requests: [request, ...state.requests], draft: EMPTY_DRAFT, lastCreatedId: id };
    }

    case 'changeStatus':
      return updateRequest(state, action.id, (r) => {
        const next = {
          ...r,
          status: action.status,
          assignedTo: action.assignedTo ?? r.assignedTo,
          resolvedAt: action.status === 'Resolved' ? nowIso() : r.resolvedAt,
          isNew: false
        };
        return withHistory(next, { by: action.by, status: action.status, note: action.note });
      });

    case 'addNote':
      return updateRequest(state, action.id, (r) =>
        withHistory({ ...r, isNew: false }, { by: action.by, status: null, note: action.note }));

    case 'bookJob':
      return updateRequest(state, action.id, (r) => {
        const jobId = Math.max(0, ...state.requests.flatMap((x) => x.jobs.map((j) => j.id))) + 1;
        const job = { id: jobId, vendorId: action.vendorId, description: action.description, scheduled: action.scheduled, completed: null, cost: null };
        return withHistory({ ...r, jobs: [...r.jobs, job] }, { by: action.by, status: null, note: `${action.vendorName} booked for ${action.scheduledLabel}: ${action.description}.` });
      });

    case 'completeJob':
      return updateRequest(state, action.id, (r) => {
        const jobs = r.jobs.map((j) => (j.id === action.jobId ? { ...j, completed: action.completed, cost: action.cost } : j));
        return withHistory({ ...r, jobs }, { by: action.by, status: null, note: `Vendor job finished on ${action.completedLabel}. Final cost $${action.cost.toFixed(2)}.` });
      });

    default:
      return state;
  }
}

export const statusIndex = (status) => STATUSES.indexOf(status);
export const isOpen = (request) => request.status !== 'Resolved';
