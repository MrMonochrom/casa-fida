import { beforeEach, describe, expect, it } from 'vitest'
import { outbox } from '../mailer.ts'
import { createBuilder, createClient, newAgent, resetDb, signUp, validProposal } from '../test/helpers.ts'

beforeEach(resetDb)

// What a browser sends once the app's language is set to Romanian or Russian.
const ro = 'cf_lang=ro'
const ru = 'cf_lang=ru'

describe('the language of answers', () => {
  it('is English when nothing says otherwise', async () => {
    const res = await newAgent().post('/api/login').send({ email: 'nobody@example.com', password: 'x' })
    expect(res.body.error).toBe('Wrong email or password.')
  })

  it("follows the browser's Accept-Language", async () => {
    const res = await newAgent()
      .post('/api/login')
      .set('Accept-Language', 'de-DE,ru;q=0.9,en;q=0.8')
      .send({ email: 'nobody@example.com', password: 'x' })
    expect(res.body.error).toBe('Неверная почта или пароль.')
  })

  it('follows the language chosen in the app over the browser', async () => {
    const res = await newAgent()
      .post('/api/login')
      .set('Accept-Language', 'ru')
      .set('Cookie', ro)
      .send({ email: 'nobody@example.com', password: 'x' })
    expect(res.body.error).toBe('Emailul sau parola sunt greșite.')
  })

  it('covers validation, errors thrown inside routes, and unknown addresses', async () => {
    const signup = await newAgent().post('/api/signup').set('Cookie', ru).send({ role: 'client', name: 'Ana' })
    expect(signup.body.error).toBe('Пожалуйста, введите правильный адрес электронной почты.')

    const { agent } = await signUp()
    const missing = await agent.get('/api/projects/999999').set('Cookie', ro)
    expect(missing.status).toBe(404)
    expect(missing.body.error).toBe('Acest proiect nu există.')

    const unknown = await newAgent().get('/api/nothing-here').set('Cookie', ru)
    expect(unknown.body.error).toBe('Не найдено.')

    const loggedOut = await newAgent().get('/api/projects').set('Cookie', ro)
    expect(loggedOut.body.error).toBe('Vă rugăm să vă conectați din nou.')
  })

  it("emails a proposal in the builder's language, with the price written that way", async () => {
    const bob = await createBuilder({ businessName: 'Bob Builds' }, { name: 'Bob Stone' })
    await createClient({ name: 'Ana Lima', email: 'ana@example.com' })

    const res = await bob.agent
      .post('/api/projects')
      .set('Cookie', ro)
      .send(validProposal('ana@example.com', { contractAmount: 2_000_050 }))
    expect(res.status).toBe(201)

    const email = outbox.at(-1)!
    expect(email.subject).toBe('Bob Builds v-a trimis o propunere de proiect')
    // The name the builder typed: they don't see the client's own name until working together.
    expect(email.text).toContain('Bună ziua, Cleo Client,')
    expect(email.text).toContain('Bob Stone (Bob Builds) v-a trimis o propunere pe Casa Fida:')
    expect(email.text.replace(/\s/g, ' ')).toContain('Preț: 20.000,50 $')
  })
})
