/** Stands in for the browser's EventSource (live updates), so tests can send events themselves. */
export class FakeEventSource {
  static instances: FakeEventSource[] = []

  readonly url: string
  closed = false
  private readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener)
  }

  close() {
    this.closed = true
  }

  /** Sends an event, as the server would. */
  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(new MessageEvent(type, { data: JSON.stringify(data) }))
  }

  /** The connection the app has open right now. */
  static get open(): FakeEventSource | undefined {
    return FakeEventSource.instances.findLast((s) => !s.closed)
  }
}
