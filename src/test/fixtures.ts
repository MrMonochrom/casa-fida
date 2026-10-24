import type {
  BuilderCard,
  BuilderDetail,
  BuilderProfile,
  ChangeOrder,
  Conversation,
  Invoice,
  Job,
  Message,
  OpenJob,
  Project,
  ProjectSummary,
  ProjectUpdate,
  Quote,
  User,
} from '../types'

let nextId = 100

const MAY_1 = Date.UTC(2026, 4, 1, 15, 0)

export function makeProfile(overrides: Partial<BuilderProfile> = {}): BuilderProfile {
  return {
    businessName: 'Reid & Sons Construction',
    headline: 'Family-run general contractor.',
    about: 'We build things properly.',
    serviceArea: 'Denver, CO',
    yearsInBusiness: 18,
    licenseNumber: 'GC-48213',
    insured: true,
    trades: ['extensions', 'renovations'],
    ...overrides,
  }
}

/** A client, unless overridden. */
export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'emma@example.com',
    name: 'Emma Clarke',
    role: 'client',
    phone: null,
    emailVerified: true,
    notifications: { quotes: true, projects: true, messages: true },
    memberSince: MAY_1,
    builderProfile: null,
    ...overrides,
  }
}

export function makeBuilderUser(overrides: Partial<User> = {}): User {
  return makeUser({
    id: 2,
    email: 'marcus@example.com',
    name: 'Marcus Reid',
    role: 'builder',
    builderProfile: makeProfile(),
    ...overrides,
  })
}

export function makeBuilderCard(overrides: Partial<BuilderCard> = {}): BuilderCard {
  return {
    id: nextId++,
    name: 'Marcus Reid',
    businessName: 'Reid & Sons Construction',
    headline: 'Family-run general contractor.',
    serviceArea: 'Denver, CO',
    trades: ['extensions', 'renovations'],
    yearsInBusiness: 18,
    licensed: true,
    insured: true,
    rating: 4.5,
    reviewCount: 2,
    completedProjects: 2,
    memberSince: MAY_1,
    ...overrides,
  }
}

export function makeBuilderDetail(overrides: Partial<BuilderDetail> = {}): BuilderDetail {
  return {
    ...makeBuilderCard(),
    about: 'We build things properly.',
    licenseNumber: 'GC-48213',
    reviews: [],
    ...overrides,
  }
}

export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: nextId++,
    title: 'Main bathroom remodel',
    description: 'Walk-in shower instead of the tub.',
    trade: 'bathrooms',
    location: 'Denver, CO',
    currency: 'USD',
    budgetMin: 1_800_000,
    budgetMax: 2_500_000,
    timing: 'within_3_months',
    status: 'open',
    createdAt: MAY_1,
    client: { id: 1, name: 'Emma Clarke' },
    quoteCount: 0,
    pendingQuotes: 0,
    projectId: null,
    ...overrides,
  }
}

export function makeOpenJob(overrides: Partial<OpenJob> = {}): OpenJob {
  return { ...makeJob({ client: { id: 1, name: 'Emma C.' }, pendingQuotes: undefined, projectId: undefined }), myQuote: null, ...overrides }
}

export function makeQuote(overrides: Partial<Quote> = {}): Quote {
  const jobId = overrides.jobId ?? nextId++
  return {
    id: nextId++,
    jobId,
    amount: 2_240_000,
    currency: 'USD',
    weeks: 5,
    message: 'Includes heated floors.',
    status: 'pending',
    createdAt: MAY_1,
    updatedAt: MAY_1,
    builder: {
      id: 2,
      name: 'Priya Shah',
      businessName: 'Shah Kitchen & Bath',
      serviceArea: 'Boulder, CO',
      insured: true,
      licensed: true,
      rating: 5,
      reviewCount: 1,
    },
    job: { id: jobId, title: 'Main bathroom remodel', location: 'Denver, CO', status: 'open', trade: 'bathrooms' },
    projectId: null,
    ...overrides,
  }
}

export function makeChangeOrder(overrides: Partial<ChangeOrder> = {}): ChangeOrder {
  return {
    id: nextId++,
    title: 'Add a skylight',
    description: 'Over the island.',
    amount: 285_000,
    days: 3,
    status: 'pending',
    createdAt: MAY_1,
    decidedAt: null,
    ...overrides,
  }
}

export function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: nextId++,
    number: 1,
    title: 'Deposit',
    amount: 1_000_000,
    dueDate: '2026-11-01',
    status: 'due',
    overdue: false,
    createdAt: MAY_1,
    paidAt: null,
    ...overrides,
  }
}

/** An active project, seen by its client, unless overridden. */
export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: nextId++,
    title: 'Rear extension',
    description: 'A 400 sq ft extension.',
    address: '1420 Elm Street',
    currency: 'USD',
    status: 'active',
    startDate: '2026-08-21',
    createdAt: MAY_1,
    acceptedAt: MAY_1,
    completedAt: null,
    myRole: 'client',
    builder: {
      id: 2,
      name: 'Marcus Reid',
      businessName: 'Reid & Sons Construction',
      email: 'marcus@example.com',
      phone: '(303) 555-0141',
    },
    client: { id: 1, name: 'Emma Clarke', email: 'emma@example.com', phone: null },
    invitedClient: null,
    money: {
      contract: 10_000_000,
      changes: 0,
      total: 10_000_000,
      invoiced: 0,
      paid: 0,
      outstanding: 0,
      leftToInvoice: 10_000_000,
      daysAdded: 0,
    },
    stages: [
      { id: 1, name: 'Foundation', status: 'done' },
      { id: 2, name: 'Framing', status: 'in_progress' },
      { id: 3, name: 'Roofing', status: 'todo' },
    ],
    changeOrders: [],
    invoices: [],
    review: null,
    fromQuote: null,
    conversationId: 7,
    ...overrides,
  }
}

export function makeProjectSummary(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: nextId++,
    title: 'Rear extension',
    status: 'active',
    address: '1420 Elm Street',
    currency: 'USD',
    startDate: '2026-08-21',
    createdAt: MAY_1,
    builder: { id: 2, name: 'Marcus Reid', businessName: 'Reid & Sons Construction' },
    client: { id: 1, name: 'Emma Clarke' },
    invitedClient: null,
    progress: { done: 1, total: 3 },
    money: { total: 10_000_000, invoiced: 0, paid: 0 },
    pendingChanges: 0,
    dueInvoices: 0,
    overdueInvoices: 0,
    waitingOnClient: 0,
    ...overrides,
  }
}

export function makeUpdate(overrides: Partial<ProjectUpdate> = {}): ProjectUpdate {
  return {
    id: nextId++,
    author: { id: 2, name: 'Marcus Reid' },
    stage: null,
    body: 'Walls are up.',
    photos: [],
    createdAt: MAY_1,
    ...overrides,
  }
}

export function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: nextId++,
    other: { id: 2, name: 'Marcus Reid', role: 'builder', businessName: 'Reid & Sons Construction' },
    lastMessage: null,
    unread: 0,
    ...overrides,
  }
}

export function makeMessage(overrides: Partial<Message> = {}): Message {
  return { id: nextId++, fromMe: false, text: 'Hello!', sentAt: MAY_1, ...overrides }
}

/** A promise you resolve or reject yourself, to control when a mocked API call finishes. */
export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
