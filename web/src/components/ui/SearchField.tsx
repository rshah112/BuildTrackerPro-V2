import { Search, X } from 'lucide-react'

/** Compact search box for list screens. Controlled; shows a clear button when non-empty. */
export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="search-field">
      <Search size={16} className="search-icon" aria-hidden />
      <input
        type="search"
        className="search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button type="button" className="search-clear" onClick={() => onChange('')} aria-label="Clear search">
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  )
}
