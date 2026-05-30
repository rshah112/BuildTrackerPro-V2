import type { LucideIcon } from 'lucide-react'

/** Thin wrapper over lucide icons with sane defaults. Pass `label` to make it a
 *  semantic image; otherwise it's decorative (aria-hidden). */
export function Icon({
  icon: Glyph,
  size = 20,
  className,
  label,
  strokeWidth = 2,
}: {
  icon: LucideIcon
  size?: number
  className?: string
  label?: string
  strokeWidth?: number
}) {
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  )
}
