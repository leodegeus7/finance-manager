import { useState, useRef, useEffect } from 'react'
import { CategoryRow } from '@/lib/db/categories'

interface Props {
  value: string
  onChange: (id: string) => void
  categories: CategoryRow[]
  placeholder?: string
  /** Layout classes for the outer container (e.g. flex-1 min-w-0 w-full) */
  className?: string
  /** Visual classes for the input element (border, rounded, padding, text size) */
  inputClassName?: string
  autoFocus?: boolean
}

export function CategorySelect({
  value,
  onChange,
  categories,
  placeholder = 'Sem categoria',
  className = '',
  inputClassName = '',
  autoFocus,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = categories.find(c => c.id === value)
  const label = selected
    ? (selected.parent_name ? `${selected.parent_name} › ${selected.name}` : selected.name)
    : ''

  const filtered = search.trim()
    ? categories.filter(c => {
        const haystack = [c.parent_name, c.name].filter(Boolean).join(' ').toLowerCase()
        return search.toLowerCase().split(' ').every(word => haystack.includes(word))
      })
    : categories

  useEffect(() => {
    if (!open) {
      setSearch('')
    } else {
      inputRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  function handleSelect(id: string) {
    onChange(id)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        className={`w-full bg-white cursor-pointer ${inputClassName}`}
        value={open ? search : label}
        placeholder={open ? 'Pesquisar categoria...' : placeholder}
        onClick={() => setOpen(true)}
        onChange={e => { setOpen(true); setSearch(e.target.value) }}
        readOnly={!open}
      />

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
          <div
            className={`px-3 py-2 text-sm text-gray-400 cursor-pointer hover:bg-gray-50 ${!value ? 'bg-blue-50 text-blue-600' : ''}`}
            onMouseDown={() => handleSelect('')}
          >
            {placeholder}
          </div>

          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-400 italic">Nenhuma categoria encontrada</div>
          )}

          {filtered.map(c => (
            <div
              key={c.id}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${value === c.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-800'}`}
              onMouseDown={() => handleSelect(c.id)}
            >
              {c.parent_name && (
                <span className="text-gray-400 text-xs">{c.parent_name} › </span>
              )}
              <span>{c.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
