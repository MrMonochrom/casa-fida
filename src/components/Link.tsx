import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { navigate } from '../router'

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string
}

/** A link to another page of the app that doesn't reload the page. */
export function Link({ to, onClick, ...props }: LinkProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    // Let the browser handle new tabs and windows.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (props.target && props.target !== '_self') return
    e.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handleClick} {...props} />
}
