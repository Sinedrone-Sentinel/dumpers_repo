import type { UserRole } from './supabase'

const ROLE_RANK: Record<UserRole, number> = {
  pending: 0,
  member: 1,
  officer: 2,
  'super-admin': 3,
}

export function roleAtLeast(userRole: UserRole | null | undefined, minRole: UserRole): boolean {
  if (!userRole) return false
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole]
}
