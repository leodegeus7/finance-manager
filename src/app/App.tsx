import { Routes, Route, NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { Dashboard }     from './pages/Dashboard'
import { Transactions }  from './pages/Transactions'
import { AccountsCards } from './pages/AccountsCards'
import { NetWorth }      from './pages/NetWorth'
import { UserProvider, useUser } from '@/lib/UserContext'

// UI Rule 2.1 — max 4 areas, accessible in 1–2 clicks
const NAV = [
  { to: '/',           label: 'Dashboard',        icon: '⊞' },
  { to: '/transacoes', label: 'Transações',        icon: '↕' },
  { to: '/contas',     label: 'Contas & Cartões',  icon: '⬡' },
  { to: '/patrimonio', label: 'Patrimônio',         icon: '◈' },
]

/** Last N months as YYYY-MM-01 values */
function recentMonths(n = 24): string[] {
  const months: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = 0; i < n; i++) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
    d.setMonth(d.getMonth() - 1)
  }
  return months
}

const MONTH_FULL_PT: Record<number, string> = {
  0: 'Janeiro', 1: 'Fevereiro', 2: 'Março', 3: 'Abril', 4: 'Maio', 5: 'Junho',
  6: 'Julho', 7: 'Agosto', 8: 'Setembro', 9: 'Outubro', 10: 'Novembro', 11: 'Dezembro',
}

function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return `${MONTH_FULL_PT[m - 1]} ${y}`
}

// ── Welcome / user selection screen ──────────────────────────
function WelcomeScreen() {
  const { setUserId } = useUser()

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-10">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Finance Manager</h1>
        <p className="text-gray-400 mt-2 text-sm">Quem está acessando?</p>
      </div>

      <div className="flex gap-4">
        {(['leo', 'murilo'] as const).map((id) => (
          <button
            key={id}
            onClick={() => setUserId(id)}
            className="w-44 py-8 rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all flex flex-col items-center gap-3 group"
          >
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center text-white text-xl font-bold group-hover:scale-105 transition-transform">
              {id === 'leo' ? 'L' : 'M'}
            </div>
            <span className="text-sm font-semibold text-gray-900">
              {id === 'leo' ? 'Leonardo' : 'Murilo'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────
function Sidebar() {
  const { userId, userName, clearUser, month, setMonth } = useUser()
  const months = recentMonths()

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-gray-100 flex flex-col py-6 px-4 fixed h-full z-10">

      <nav className="flex flex-col gap-1 flex-1">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
                isActive
                  ? 'bg-gray-900 text-white font-medium'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900',
              )
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Month selector */}
      <div className="mt-auto px-1 space-y-4">
        <div>
          <p className="text-xs text-gray-400 mb-1">Competência</p>
          <select
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          >
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </div>

        {/* User indicator + switch button */}
        <div className="flex items-center justify-between px-1 py-2 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gray-900 flex items-center justify-center text-white text-xs font-bold">
              {userName[0]}
            </div>
            <span className="text-xs font-medium text-gray-700">{userName}</span>
          </div>
          <button
            onClick={clearUser}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
            title="Trocar usuário"
          >
            Trocar
          </button>
        </div>
      </div>
    </aside>
  )
}

// ── App ───────────────────────────────────────────────────────
function AppShell() {
  const { hasChosen } = useUser()

  if (!hasChosen) return <WelcomeScreen />

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar />
      <main className="flex-1 ml-56 min-h-screen">
        <Routes>
          <Route path="/"            element={<Dashboard />} />
          <Route path="/transacoes"  element={<Transactions />} />
          <Route path="/contas"      element={<AccountsCards />} />
          <Route path="/patrimonio"  element={<NetWorth />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <UserProvider>
      <AppShell />
    </UserProvider>
  )
}
