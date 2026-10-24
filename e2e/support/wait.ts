// Waiting for something outside the page (an email) or computed from it (the menu's labels).
// expect.poll would do, but reports list each of its early tries as a failed step, so a passing
// step looks broken. This waits quietly; the step then checks once, with the usual expect message.

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Waits until `ready` says yes, for up to `timeout` milliseconds. Never fails by itself. */
export async function settle(ready: () => boolean | Promise<boolean>, timeout = 10_000) {
  const deadline = Date.now() + timeout
  while (!(await ready()) && Date.now() < deadline) await pause(100)
}
