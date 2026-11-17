import { useEffect, useState } from 'react'
import { api } from './api'

export interface Person {
  id: string
  name: string
}

let cache: Promise<Person[]> | null = null

/** People on this instance (names for votes); fetched once per page load. */
export function useUsers(): Map<string, string> {
  const [users, setUsers] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    cache ??= api<Person[]>('/api/users').catch(() => [])
    void cache.then((list) => setUsers(new Map(list.map((u) => [u.id, u.name]))))
  }, [])
  return users
}
