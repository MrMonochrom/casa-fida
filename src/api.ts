import type { Role, Trade } from '../shared/rules'
import type {
  BuilderCard,
  BuilderDetail,
  BuilderProfile,
  Conversation,
  EmailSettings,
  InvitePreview,
  Job,
  JobInput,
  Message,
  OpenJob,
  Project,
  ProjectDetailsInput,
  ProjectSummary,
  ProjectUpdate,
  ProposalInput,
  Quote,
  QuoteInput,
  StageStatus,
  Summary,
  User,
} from './types'
import { getT } from './i18n'

export interface SignupInput {
  name: string
  email: string
  password: string
  role: Role
}

export interface ChangeOrderInput {
  title: string
  description: string
  amount: number
  days: number
}

export interface InvoiceInput {
  title: string
  amount: number
  dueDate: string
}

/** An error answer from the server: its message is for the person, its status for the code. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let onUnauthorized: (() => void) | null = null

/** Called when the server says the session is gone, for example after a password change elsewhere. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method }
  if (body instanceof Blob) {
    init.body = body
    init.headers = { 'Content-Type': body.type }
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }

  let res: Response
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new Error(getT().common.offline)
  }
  // A wrong password on the login form is also a 401, but that isn't a lost session.
  if (res.status === 401 && path !== '/login') onUnauthorized?.()
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.error ?? getT().common.offline)
  return data as T
}

/** A query string from the values that are set: { q: 'deck', trade: '' } → "?q=deck". */
function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
  const text = search.toString()
  return text ? `?${text}` : ''
}

type ProjectResult = Promise<Project>
const project = (r: { project: Project }) => r.project

export const api = {
  // Account
  me: () => request<{ user: User | null }>('GET', '/me').then((r) => r.user),
  login: (email: string, password: string) =>
    request<{ user: User }>('POST', '/login', { email, password }).then((r) => r.user),
  signup: (input: SignupInput) => request<{ user: User }>('POST', '/signup', input).then((r) => r.user),
  logout: () => request<void>('POST', '/logout', {}),
  /** Confirms an email address with the token from the confirmation email. */
  verifyEmail: (token: string) =>
    request<{ email: string }>('POST', '/verify-email', { token }).then((r) => r.email),
  resendVerification: () => request<void>('POST', '/me/verify-email', {}),
  /** Starts a builder's one free trial of Pro. */
  startTrial: () => request<{ user: User }>('POST', '/me/plan/trial', {}).then((r) => r.user),
  saveEmailSettings: (settings: EmailSettings) =>
    request<{ user: User }>('PUT', '/me/notifications', settings).then((r) => r.user),
  /** Emails a link to choose a new password, if an account uses the address. */
  requestPasswordReset: (email: string) => request<void>('POST', '/password-reset', { email }),
  /** Sets a new password with the token from that email, and logs in. */
  resetPassword: (token: string, password: string) =>
    request<{ user: User }>('POST', '/password-reset/confirm', { token, password }).then((r) => r.user),
  saveAccount: (name: string, phone: string) =>
    request<{ user: User }>('PUT', '/me', { name, phone }).then((r) => r.user),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('PUT', '/me/password', { currentPassword, newPassword }),
  saveBuilderProfile: (profile: BuilderProfile) =>
    request<{ user: User }>('PUT', '/me/builder-profile', profile).then((r) => r.user),

  // Finding builders
  builders: (q = '', trade: Trade | '' = '') =>
    request<{ builders: BuilderCard[] }>('GET', `/builders${query({ q, trade })}`).then((r) => r.builders),
  builder: (id: number) => request<{ builder: BuilderDetail }>('GET', `/builders/${id}`).then((r) => r.builder),

  // Jobs, for clients
  postJob: (input: JobInput) => request<{ job: Job }>('POST', '/jobs', input).then((r) => r.job),
  myJobs: () => request<{ jobs: Job[] }>('GET', '/jobs/mine').then((r) => r.jobs),
  saveJob: (id: number, input: JobInput) => request<{ job: Job }>('PUT', `/jobs/${id}`, input).then((r) => r.job),
  closeJob: (id: number) => request<{ job: Job }>('POST', `/jobs/${id}/close`, {}).then((r) => r.job),
  jobWithQuotes: (id: number) => request<{ job: Job; quotes: Quote[] }>('GET', `/jobs/${id}`),
  acceptQuote: (id: number) =>
    request<{ projectId: number }>('POST', `/quotes/${id}/accept`, {}).then((r) => r.projectId),
  declineQuote: (id: number) => request<{ quote: Quote }>('POST', `/quotes/${id}/decline`, {}).then((r) => r.quote),

  // Jobs, for builders
  openJobs: (trade: Trade | 'mine' | '' = '') =>
    request<{ jobs: OpenJob[] }>('GET', `/jobs${query({ trade })}`).then((r) => r.jobs),
  myQuotes: () => request<{ quotes: Quote[] }>('GET', '/quotes/mine').then((r) => r.quotes),
  jobForBuilder: (id: number) => request<{ job: Job; myQuote: Quote | null }>('GET', `/jobs/${id}`),
  sendQuote: (jobId: number, input: QuoteInput) =>
    request<{ quote: Quote }>('PUT', `/jobs/${jobId}/quote`, input).then((r) => r.quote),
  withdrawQuote: (jobId: number) => request<void>('DELETE', `/jobs/${jobId}/quote`),

  // Projects
  projects: () => request<{ projects: ProjectSummary[] }>('GET', '/projects').then((r) => r.projects),
  project: (id: number): ProjectResult => request<{ project: Project }>('GET', `/projects/${id}`).then(project),
  propose: (input: ProposalInput): ProjectResult =>
    request<{ project: Project }>('POST', '/projects', input).then(project),
  saveProject: (id: number, input: ProjectDetailsInput): ProjectResult =>
    request<{ project: Project }>('PUT', `/projects/${id}`, input).then(project),
  deleteProject: (id: number) => request<void>('DELETE', `/projects/${id}`),
  inviteLink: (id: number) =>
    request<{ link: string }>('POST', `/projects/${id}/invite-link`, {}).then((r) => r.link),
  acceptProject: (id: number): ProjectResult =>
    request<{ project: Project }>('POST', `/projects/${id}/accept`, {}).then(project),
  declineProject: (id: number): ProjectResult =>
    request<{ project: Project }>('POST', `/projects/${id}/decline`, {}).then(project),
  completeProject: (id: number): ProjectResult =>
    request<{ project: Project }>('POST', `/projects/${id}/complete`, {}).then(project),
  review: (id: number, rating: number, body: string): ProjectResult =>
    request<{ project: Project }>('POST', `/projects/${id}/review`, { rating, body }).then(project),

  // Invite links from proposal emails
  previewInvite: (token: string) =>
    request<{ invite: InvitePreview }>('POST', '/invites/preview', { token }).then((r) => r.invite),
  claimInvite: (token: string) =>
    request<{ projectId: number }>('POST', '/invites/claim', { token }).then((r) => r.projectId),

  // Stages
  addStage: (projectId: number, name: string): ProjectResult =>
    request<{ project: Project }>('POST', `/projects/${projectId}/stages`, { name }).then(project),
  saveStage: (id: number, changes: { name?: string; status?: StageStatus }): ProjectResult =>
    request<{ project: Project }>('PUT', `/stages/${id}`, changes).then(project),
  deleteStage: (id: number): ProjectResult =>
    request<{ project: Project }>('DELETE', `/stages/${id}`).then(project),
  orderStages: (projectId: number, ids: number[]): ProjectResult =>
    request<{ project: Project }>('PUT', `/projects/${projectId}/stages/order`, { ids }).then(project),

  // Progress updates
  updates: (projectId: number) =>
    request<{ updates: ProjectUpdate[] }>('GET', `/projects/${projectId}/updates`).then((r) => r.updates),
  postUpdate: (projectId: number, body: string, stageId: number | null) =>
    request<{ update: ProjectUpdate }>('POST', `/projects/${projectId}/updates`, { body, stageId }).then(
      (r) => r.update,
    ),
  addPhoto: (updateId: number, jpeg: Blob) =>
    request<{ photo: { id: number; url: string } }>('POST', `/updates/${updateId}/photos`, jpeg).then((r) => r.photo),
  deleteUpdate: (id: number) => request<void>('DELETE', `/updates/${id}`),

  // Change orders
  addChangeOrder: (projectId: number, input: ChangeOrderInput): ProjectResult =>
    request<{ project: Project }>('POST', `/projects/${projectId}/change-orders`, input).then(project),
  approveChange: (id: number): ProjectResult =>
    request<{ project: Project }>('POST', `/change-orders/${id}/approve`, {}).then(project),
  declineChange: (id: number): ProjectResult =>
    request<{ project: Project }>('POST', `/change-orders/${id}/decline`, {}).then(project),
  withdrawChange: (id: number): ProjectResult =>
    request<{ project: Project }>('POST', `/change-orders/${id}/withdraw`, {}).then(project),

  // Invoices
  addInvoice: (projectId: number, input: InvoiceInput): ProjectResult =>
    request<{ project: Project }>('POST', `/projects/${projectId}/invoices`, input).then(project),
  markPaid: (id: number): ProjectResult =>
    request<{ project: Project }>('POST', `/invoices/${id}/paid`, {}).then(project),
  voidInvoice: (id: number): ProjectResult =>
    request<{ project: Project }>('POST', `/invoices/${id}/void`, {}).then(project),

  // Messages
  conversations: () =>
    request<{ conversations: Conversation[] }>('GET', '/conversations').then((r) => r.conversations),
  /** The conversation with someone, started if needed. */
  openConversation: (userId: number) =>
    request<{ conversation: Conversation }>('POST', '/conversations', { userId }).then((r) => r.conversation),
  messages: (conversationId: number, afterId = 0) =>
    request<{ conversation: Conversation; messages: Message[]; seenUpTo: number | null }>(
      'GET',
      `/conversations/${conversationId}/messages?after=${afterId}`,
    ),
  sendMessage: (conversationId: number, text: string) =>
    request<{ message: Message }>('POST', `/conversations/${conversationId}/messages`, { text }).then(
      (r) => r.message,
    ),

  // Menu badges
  summary: () => request<Summary>('GET', '/summary'),
}
