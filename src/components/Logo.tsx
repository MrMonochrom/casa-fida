/** The Casa Fida mark (a house, the same drawing as public/favicon.svg) and name. */
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo${small ? ' logo--small' : ''}`}>
      <svg
        className="logo__mark"
        viewBox="0 0 32 32"
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="7" fill="#ea580c" stroke="none" />
        <path d="M5.5 15 16 6.5 26.5 15" strokeWidth="2.5" />
        <path d="M9 12.5V25h14V12.5" strokeWidth="2.5" />
        <path d="M14 25v-4.5a2 2 0 0 1 4 0V25" strokeWidth="2" />
      </svg>
      <span className="logo__name">Casa Fida</span>
    </span>
  )
}
