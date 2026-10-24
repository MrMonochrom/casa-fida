// The people in db/seed.sql, by first name, so scenarios can say "Given I am logged in as Emma".
import { SAMPLE_PASSWORD } from './settings.ts'

export interface Person {
  firstName: string
  name: string
  email: string
  password: string
  role: 'client' | 'builder'
  /** Builders' business name: how clients see them in lists and in Messages. */
  business?: string
}

const sample = (name: string, role: Person['role'], business?: string): Person => ({
  firstName: name.split(' ')[0],
  name,
  email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
  password: SAMPLE_PASSWORD,
  role,
  business,
})

export const SAMPLE_PEOPLE: Person[] = [
  sample('Marcus Reid', 'builder', 'Reid & Sons Construction'),
  sample('Priya Shah', 'builder', 'Shah Kitchen & Bath'),
  sample('Tom Becker', 'builder', 'Becker Roofing'),
  sample('Lena Ortiz', 'builder', 'Ortiz Outdoor Living'),
  sample('Sam Whitfield', 'builder', 'Whitfield Electric'),
  sample('Grace Kim', 'builder', 'Kim Renovation Co.'),
  sample('Emma Clarke', 'client'),
  sample('David Nguyen', 'client'),
  sample('Olivia Brooks', 'client'),
  sample('Noah Patel', 'client'),
]

/** How someone appears to others in Messages and lists: a builder by their business. */
export const shownAs = (person: Person) => person.business ?? person.name
