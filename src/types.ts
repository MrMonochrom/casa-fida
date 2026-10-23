// The shapes the API sends. Amounts are whole cents, in the currency of the job or project they
// belong to; times are milliseconds since 1970 (like Date.now()); dates without a time are
// 'YYYY-MM-DD' strings.
import type { Currency } from '../shared/money'
import type { JobTiming, Role, Trade } from '../shared/rules'

export interface BuilderProfile {
  businessName: string
  headline: string
  about: string
  serviceArea: string
  yearsInBusiness: number | null
  licenseNumber: string | null
  insured: boolean
  trades: Trade[]
}

/** The logged-in person. */
export interface User {
  id: number
  email: string
  name: string
  role: Role
  phone: string | null
  /** Whether they've opened the link in the confirmation email (or an invite sent to their address). */
  emailVerified: boolean
  memberSince: number
  /** Builders only, once they've set up their business profile. */
  builderProfile: BuilderProfile | null
}

/** A builder in search results. */
export interface BuilderCard {
  id: number
  name: string
  businessName: string
  headline: string
  serviceArea: string
  trades: Trade[]
  yearsInBusiness: number | null
  licensed: boolean
  insured: boolean
  /** Average stars, to one decimal, or null before the first review. */
  rating: number | null
  reviewCount: number
  completedProjects: number
  memberSince: number
}

export interface Review {
  id: number
  rating: number
  body: string
  /** "Emma C." */
  author: string
  projectTitle: string
  createdAt: number
}

/** A builder's public profile page. */
export interface BuilderDetail extends BuilderCard {
  about: string
  licenseNumber: string | null
  reviews: Review[]
}

export type JobStatus = 'open' | 'hired' | 'closed'
export type QuoteStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn'

export interface Job {
  id: number
  title: string
  description: string
  trade: Trade
  location: string
  /** The budget and every quote on the job are in this currency. */
  currency: Currency
  budgetMin: number | null
  budgetMax: number | null
  timing: JobTiming
  status: JobStatus
  createdAt: number
  /** Builders see the client's short name ("Emma C."). */
  client: { id: number; name: string }
  quoteCount: number
  /** Only for the job's client. */
  pendingQuotes?: number
  /** Only for the job's client: the project, once a builder is hired. */
  projectId?: number | null
}

/** An open job in a builder's list, with the quote they sent (if any). */
export interface OpenJob extends Job {
  myQuote: { id: number; amount: number; status: QuoteStatus } | null
}

export interface Quote {
  id: number
  jobId: number
  amount: number
  /** The job's currency. */
  currency: Currency
  weeks: number | null
  message: string
  status: QuoteStatus
  createdAt: number
  updatedAt: number
  builder: {
    id: number
    name: string
    businessName: string
    serviceArea: string
    insured: boolean
    licensed: boolean
    rating: number | null
    reviewCount: number
  }
  job: { id: number; title: string; location: string; status: JobStatus; trade: Trade }
  /** The project this quote became, once accepted. */
  projectId: number | null
}

export interface JobInput {
  title: string
  description: string
  trade: Trade | ''
  location: string
  currency: Currency
  budgetMin: number | null
  budgetMax: number | null
  timing: JobTiming
}

export interface QuoteInput {
  amount: number
  /** The job's currency, as the builder saw it. */
  currency: Currency
  weeks: number | null
  message: string
}

export type ProjectStatus = 'proposed' | 'active' | 'completed' | 'declined'
export type StageStatus = 'todo' | 'in_progress' | 'done'
export type ChangeOrderStatus = 'pending' | 'approved' | 'declined' | 'withdrawn'
export type InvoiceStatus = 'due' | 'paid' | 'void'

/** A project in the list. */
export interface ProjectSummary {
  id: number
  title: string
  status: ProjectStatus
  address: string
  currency: Currency
  startDate: string | null
  createdAt: number
  builder: { id: number; name: string; businessName: string }
  client: { id: number; name: string } | null
  /** Who a proposal was sent to, until they have an account. */
  invitedClient: { name: string; email: string } | null
  progress: { done: number; total: number }
  money: { total: number; invoiced: number; paid: number }
  pendingChanges: number
  dueInvoices: number
  overdueInvoices: number
  /** Things only the client can move forward: a proposal, change orders, invoices. */
  waitingOnClient: number
}

export interface Stage {
  id: number
  name: string
  status: StageStatus
}

export interface ChangeOrder {
  id: number
  title: string
  description: string
  /** Can be negative, for work taken out. */
  amount: number
  days: number
  status: ChangeOrderStatus
  createdAt: number
  decidedAt: number | null
}

export interface Invoice {
  id: number
  number: number
  title: string
  amount: number
  dueDate: string
  status: InvoiceStatus
  overdue: boolean
  createdAt: number
  paidAt: number | null
}

export interface ProjectMoney {
  contract: number
  changes: number
  total: number
  invoiced: number
  paid: number
  outstanding: number
  leftToInvoice: number
  daysAdded: number
}

/** Everything on a project page. */
export interface Project {
  id: number
  title: string
  description: string
  address: string
  status: ProjectStatus
  /** Every amount on the project is in this currency. */
  currency: Currency
  startDate: string | null
  createdAt: number
  acceptedAt: number | null
  completedAt: number | null
  myRole: 'builder' | 'client'
  builder: { id: number; name: string; businessName: string; email: string; phone: string | null }
  client: { id: number; name: string; email: string; phone: string | null } | null
  invitedClient: { name: string; email: string } | null
  money: ProjectMoney
  stages: Stage[]
  changeOrders: ChangeOrder[]
  invoices: Invoice[]
  review: { id: number; rating: number; body: string; createdAt: number } | null
  fromQuote: { jobId: number; weeks: number | null; message: string } | null
  conversationId: number | null
}

export interface ProjectUpdate {
  id: number
  author: { id: number; name: string }
  stage: { id: number; name: string } | null
  body: string
  photos: { id: number; url: string }[]
  createdAt: number
}

export interface ProjectDetailsInput {
  title: string
  description: string
  address: string
  startDate: string | null
  currency: Currency
  contractAmount: number
}

export interface ProposalInput extends ProjectDetailsInput {
  clientName: string
  clientEmail: string
  stages: string[]
}

export interface Conversation {
  id: number
  other: { id: number; name: string; role: Role; businessName: string | null }
  lastMessage: { text: string; fromMe: boolean; sentAt: number } | null
  unread: number
}

export interface Message {
  id: number
  fromMe: boolean
  text: string
  sentAt: number
}

/** The numbers on the menu badges. */
export interface Summary {
  unreadMessages: number
  /** For clients: proposals, change orders and invoices waiting for them. */
  projects: number
  /** For clients: quotes to answer. For builders: open jobs in their trades they haven't quoted on. */
  jobs: number
}

/** A live update from the server while the app is open. */
export type AppEvent =
  | { type: 'message' | 'read'; conversationId: number }
  | { type: 'project'; projectId: number }
  | { type: 'job'; jobId: number }

export interface InvitePreview {
  businessName: string
  builderName: string
  title: string
  clientName: string
  clientEmail: string
}
