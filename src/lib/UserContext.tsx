import { createContext, useContext, useState, ReactNode } from 'react'

export type UserId = 'leo' | 'murilo' | 'fazenda'

interface UserContextValue {
  userId:     UserId
  userName:   string
  isFazenda:  boolean          // farm ledger — hides couple-only features
  hasChosen:  boolean          // false = show welcome/selection screen
  setUserId:  (id: UserId) => void
  clearUser:  () => void       // go back to selection screen
  month:      string           // YYYY-MM-01
  setMonth:   (m: string) => void
}

const USERS: Record<UserId, string> = {
  leo:     'Leonardo',
  murilo:  'Murilo',
  fazenda: 'Fazenda',
}

function isUserId(v: string | null): v is UserId {
  return v === 'leo' || v === 'murilo' || v === 'fazenda'
}

function currentMonthISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const UserContext = createContext<UserContextValue>({
  userId:    'leo',
  userName:  'Leonardo',
  isFazenda: false,
  hasChosen: false,
  setUserId: () => {},
  clearUser: () => {},
  month:     currentMonthISO(),
  setMonth:  () => {},
})

export function useUser() {
  return useContext(UserContext)
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserIdState] = useState<UserId>(() => {
    const stored = localStorage.getItem('finance_user_id')
    return isUserId(stored) ? stored : 'leo'
  })

  // hasChosen: true if user already picked a profile (saved in localStorage)
  const [hasChosen, setHasChosen] = useState<boolean>(
    () => !!localStorage.getItem('finance_user_id'),
  )

  const [month, setMonthState] = useState<string>(() => {
    return localStorage.getItem('finance_month') ?? currentMonthISO()
  })

  function setUserId(id: UserId) {
    setUserIdState(id)
    setHasChosen(true)
    localStorage.setItem('finance_user_id', id)
  }

  function clearUser() {
    setHasChosen(false)
    localStorage.removeItem('finance_user_id')
  }

  function setMonth(m: string) {
    setMonthState(m)
    localStorage.setItem('finance_month', m)
  }

  return (
    <UserContext.Provider value={{ userId, userName: USERS[userId], isFazenda: userId === 'fazenda', hasChosen, setUserId, clearUser, month, setMonth }}>
      {children}
    </UserContext.Provider>
  )
}
