import { createContext, useContext, useState, ReactNode } from 'react'

export type UserId = 'leo' | 'murilo' | 'fazenda'

interface UserContextValue {
  userId:     UserId
  userName:   string
  isFazenda:  boolean          // farm ledger — hides couple-only features
  isReadOnly: boolean          // true for the "ary" passphrase — view only, no mutations
  hasChosen:  boolean          // false = show welcome/login screen
  login:      (passphrase: string) => boolean   // returns false if not recognized
  clearUser:  () => void       // go back to the login screen
  month:      string           // YYYY-MM-01
  setMonth:   (m: string) => void
}

const USERS: Record<UserId, string> = {
  leo:     'Leonardo',
  murilo:  'Murilo',
  fazenda: 'Fazenda',
}

// Palavra-chave → perfil. NÃO é autenticação de verdade (ver CLAUDE.md — RLS
// hoje é "allow all"): só evita acesso casual/por engano, não bloqueia
// alguém com acesso técnico à API do Supabase.
const PASSPHRASES: Record<string, { userId: UserId; readOnly: boolean }> = {
  fazenda:  { userId: 'fazenda', readOnly: false },
  murilo:   { userId: 'murilo',  readOnly: false },
  leonardo: { userId: 'leo',     readOnly: false },
  ary:      { userId: 'fazenda', readOnly: true },
}

function isUserId(v: string | null): v is UserId {
  return v === 'leo' || v === 'murilo' || v === 'fazenda'
}

function currentMonthISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const UserContext = createContext<UserContextValue>({
  userId:     'leo',
  userName:   'Leonardo',
  isFazenda:  false,
  isReadOnly: false,
  hasChosen:  false,
  login:      () => false,
  clearUser:  () => {},
  month:      currentMonthISO(),
  setMonth:   () => {},
})

export function useUser() {
  return useContext(UserContext)
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserIdState] = useState<UserId>(() => {
    const stored = localStorage.getItem('finance_user_id')
    return isUserId(stored) ? stored : 'leo'
  })

  const [isReadOnly, setIsReadOnly] = useState<boolean>(
    () => localStorage.getItem('finance_read_only') === '1',
  )

  // hasChosen: true if a passphrase was already accepted (saved in localStorage)
  const [hasChosen, setHasChosen] = useState<boolean>(
    () => !!localStorage.getItem('finance_user_id'),
  )

  const [month, setMonthState] = useState<string>(() => {
    return localStorage.getItem('finance_month') ?? currentMonthISO()
  })

  function login(passphrase: string): boolean {
    const match = PASSPHRASES[passphrase.trim().toLowerCase()]
    if (!match) return false

    setUserIdState(match.userId)
    setIsReadOnly(match.readOnly)
    setHasChosen(true)
    localStorage.setItem('finance_user_id', match.userId)
    localStorage.setItem('finance_read_only', match.readOnly ? '1' : '0')
    return true
  }

  function clearUser() {
    setHasChosen(false)
    localStorage.removeItem('finance_user_id')
    localStorage.removeItem('finance_read_only')
  }

  function setMonth(m: string) {
    setMonthState(m)
    localStorage.setItem('finance_month', m)
  }

  return (
    <UserContext.Provider
      value={{
        userId, userName: USERS[userId], isFazenda: userId === 'fazenda', isReadOnly,
        hasChosen, login, clearUser, month, setMonth,
      }}
    >
      {children}
    </UserContext.Provider>
  )
}
