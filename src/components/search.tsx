import { useState, type FormEvent } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function SearchBar({ placeholder = 'Search people, places, and stories' }: { placeholder?: string }) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    navigate(`/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`)
  }
  return <form className="search-bar" role="search" onSubmit={submit}><Search size={18} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search Banjara Connect" placeholder={placeholder} /><button type="submit" aria-label="Search"><ArrowRight size={17} /><span className="visually-hidden">Search</span></button></form>
}
