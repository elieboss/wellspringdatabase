// Sample data for the prototype. It mirrors database/wellspring.sql
// so the screens show the same rooms, people, vendors and requests.

export const STATUSES = ['Reported', 'Assigned', 'In Progress', 'Resolved'];
export const URGENCIES = [
  { value: 'Low', hint: 'Can wait a few weeks' },
  { value: 'Medium', hint: 'Should be fixed this month' },
  { value: 'High', hint: 'Affects a booking this week' },
  { value: 'Urgent', hint: 'Unsafe, or the room cannot be used' }
];

export const PEOPLE = [
  { id: 1, name: 'Dana Lee', type: 'Staff', role: 'Front desk' },
  { id: 2, name: 'Marcus Hill', type: 'Staff', role: 'Facilities' },
  { id: 3, name: 'Ava Thompson', type: 'Staff', role: 'Bookings' },
  { id: 4, name: 'Priya Shah', type: 'Volunteer', role: 'Volunteer' },
  { id: 5, name: 'Jordan Ruiz', type: 'Board', role: 'Board member' }
];

export const ROOMS = [
  { id: 1, name: 'Main Hall', floor: '1' },
  { id: 2, name: 'Cellar Theater', floor: 'Basement' },
  { id: 3, name: 'Gallery', floor: '2' },
  { id: 4, name: 'Kitchen', floor: '1' },
  { id: 5, name: 'Lobby', floor: '1' }
];

export const CATEGORIES = [
  { id: 1, name: 'HVAC', hint: 'Heating, air conditioning, thermostats', service: 'HVAC' },
  { id: 2, name: 'A/V', hint: 'Projectors, speakers, microphones', service: 'A/V' },
  { id: 3, name: 'Plumbing', hint: 'Sinks, toilets, pipes, leaks', service: 'Plumbing' },
  { id: 4, name: 'Lighting', hint: 'Light fixtures, bulbs, stage lights', service: 'Electrical' },
  { id: 5, name: 'Electrical', hint: 'Outlets, breakers, wiring', service: 'Electrical' }
];

export const VENDORS = [
  { id: 1, name: 'CoolAir Mechanical', contact: 'Sam Ortiz', phone: '(555) 300-1000', services: ['HVAC'], active: true },
  { id: 2, name: 'Metro Climate Services', contact: 'Renee Park', phone: '(555) 300-2000', services: ['HVAC', 'Plumbing'], active: true },
  { id: 3, name: 'StageSound AV', contact: 'Leo Grant', phone: '(555) 300-3000', services: ['A/V', 'Electrical'], active: true },
  { id: 4, name: 'FlowRight Plumbing', contact: 'Tasha Brooks', phone: '(555) 300-4000', services: ['Plumbing'], active: true },
  { id: 5, name: 'Bright Spark Electric', contact: 'Omar Haddad', phone: '(555) 300-5000', services: ['Electrical'], active: true },
  { id: 6, name: 'Sparkle Cleaning Co.', contact: null, phone: '(555) 300-6000', services: ['Cleaning'], active: false }
];

// Open requests from the sample data, plus two resolved ones so the
// queue's Resolved tab and the room history are not empty.
export const INITIAL_REQUESTS = [
  {
    id: 6, title: 'AC not cooling', roomId: 1, categoryId: 1, urgency: 'High', status: 'Resolved',
    description: 'AC is running but the room is not cooling down.',
    reportedBy: 1, assignedTo: 1, reportedAt: '2026-10-05T08:55', resolvedAt: '2026-10-09T16:45',
    history: [
      { at: '2026-10-05T08:55', by: 1, status: 'Reported', note: 'Problem reported. Room booked Saturday by a community group.' },
      { at: '2026-10-05T09:20', by: 1, status: 'Assigned', note: 'Assigned to myself.' },
      { at: '2026-10-05T11:30', by: 1, status: 'In Progress', note: 'CoolAir Mechanical booked for Wednesday.' },
      { at: '2026-10-09T16:45', by: 1, status: 'Resolved', note: 'Capacitor replaced. Cooling works; Saturday event can go ahead.' }
    ],
    jobs: [{ id: 5, vendorId: 1, description: 'Diagnose and repair AC not cooling in the Main Hall', scheduled: '2026-10-07', completed: '2026-10-09', cost: 615 }]
  },
  {
    id: 7, title: 'Projector will not turn on', roomId: 2, categoryId: 2, urgency: 'High', status: 'In Progress',
    description: 'Booth projector clicks but the lamp never lights.',
    reportedBy: 3, assignedTo: 2, reportedAt: '2026-10-19T17:30', resolvedAt: null,
    history: [
      { at: '2026-10-19T17:30', by: 3, status: 'Reported', note: 'Problem reported.' },
      { at: '2026-10-20T09:00', by: 2, status: 'Assigned', note: 'Assigned.' },
      { at: '2026-10-20T15:00', by: 2, status: 'In Progress', note: 'Lamp is dead; StageSound ordering a new one.' }
    ],
    jobs: [{ id: 6, vendorId: 3, description: 'Replace projector lamp in Cellar Theater booth', scheduled: '2026-10-29', completed: null, cost: null }]
  },
  {
    id: 8, title: 'Sink draining slowly', roomId: 4, categoryId: 3, urgency: 'Medium', status: 'Assigned',
    description: 'Main kitchen sink takes several minutes to drain.',
    reportedBy: 4, assignedTo: 2, reportedAt: '2026-10-21T12:10', resolvedAt: null,
    history: [
      { at: '2026-10-21T12:10', by: 4, status: 'Reported', note: 'Problem reported.' },
      { at: '2026-10-22T08:30', by: 2, status: 'Assigned', note: 'Assigned; will try a snake first.' }
    ],
    jobs: []
  },
  {
    id: 9, title: 'Flickering ceiling light', roomId: 5, categoryId: 4, urgency: 'Low', status: 'Reported',
    description: 'Ceiling light over the front desk flickers constantly.',
    reportedBy: 5, assignedTo: null, reportedAt: '2026-10-23T18:05', resolvedAt: null,
    history: [{ at: '2026-10-23T18:05', by: 5, status: 'Reported', note: 'Problem reported after the board meeting.' }],
    jobs: []
  },
  {
    id: 4, title: 'Thermostat display blank', roomId: 1, categoryId: 1, urgency: 'Low', status: 'Resolved',
    description: 'Thermostat by the main doors shows nothing.',
    reportedBy: 3, assignedTo: 2, reportedAt: '2026-08-20T09:00', resolvedAt: '2026-08-20T14:10',
    history: [
      { at: '2026-08-20T09:00', by: 3, status: 'Reported', note: 'Problem reported.' },
      { at: '2026-08-20T09:30', by: 2, status: 'Assigned', note: 'Assigned.' },
      { at: '2026-08-20T14:10', by: 2, status: 'Resolved', note: 'Replaced thermostat batteries; no vendor needed.' }
    ],
    jobs: []
  }
];

export const person = (id) => PEOPLE.find((p) => p.id === id);
export const room = (id) => ROOMS.find((r) => r.id === id);
export const category = (id) => CATEGORIES.find((c) => c.id === id);
export const vendor = (id) => VENDORS.find((v) => v.id === id);
