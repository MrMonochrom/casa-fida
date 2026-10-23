/** The BuildBridge mark and name. */
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`logo${small ? ' logo--small' : ''}`}>
      <svg className="logo__mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#ea580c" />
        <path d="M5 22h22" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M7 22v-4a9 9 0 0 1 18 0v4" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M12 22v-3M16 22v-4M20 22v-3" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="logo__name">BuildBridge</span>
    </span>
  )
}
