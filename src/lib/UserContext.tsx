import { createContext, useContext, useState, ReactNode } from 'react'

type UserId = 'leo' | 'murilo'

interface UserContextValue {
  userId:    UserId
  userName:  string
  hasChosen: boolean           // false = show welcome/selection screen
  setUserId: (id: UserId) => void
  clearUser: () => void        // go back to selection screen
  month:     string            // YYYY-MM-01
  setMonth:  (m: string) => void
}

const USERS: Record<UserId, string> = {
  leo:    'Leonardo',
  murilo: 'Murilo',
}

function currentMonthISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const UserContext = createContext<UserContextValue>({
  userId:    'leo',
  userName:  'Leonardo',
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
    return (stored === 'murilo' ? 'murilo' : 'leo') as UserId
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
    <UserContext.Provider value={{ userId, userName: USERS[userId], hasChosen, setUserId, clearUser, month, setMonth }}>
      {children}
    </UserContext.Provider>
  )
}
