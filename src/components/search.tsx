import { useState, type FormEvent } from 'react'
import { ArrowRight, Search, Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

export function SearchBar({ placeholder = 'Search people, places, and stories', showAssistant = false }: { placeholder?: string; showAssistant?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    setQuery(searchParams.get('q') ?? '')
  }, [searchParams])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = query.trim()
    if (location.pathname === '/search') {
      setSearchParams(value ? { q: value } : {})
    } else {
      navigate(`/search${value ? `?q=${encodeURIComponent(value)}` : ''}`)
    }
  }
  return <form className="search-bar" role="search" onSubmit={submit}><Search size={18} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search Banjara Connect" placeholder={placeholder} /><button type="submit" aria-label="Search"><ArrowRight size={17} /><span className="visually-hidden">Search</span></button>{showAssistant && <button type="button" className="search-bar__assistant" aria-label="Open Banjara Assistant" onClick={() => navigate(`/assistant${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`)}><Sparkles size={15} /><span>AI</span></button>}</form>
}
