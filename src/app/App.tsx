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

function Sidebar() {
  const { userId, setUserId, month, setMonth } = useUser()
  const months = recentMonths()

  return (
    <aside className="w-56 shrink-0 bg-white border-r border-gray-100 flex flex-col py-6 px-4 fixed h-full z-10">
      {/* User switcher */}
      <div className="mb-8 px-1">
        <p className="text-xs text-gray-400 mb-2">Você está vendo como</p>
        <div className="flex gap-1">
          {(['leo', 'murilo'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setUserId(id)}
              className={clsx(
                'flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors',
                userId === id
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
              )}
            >
              {id === 'leo' ? 'Leonardo' : 'Murilo'}
            </button>
          ))}
        </div>
      </div>

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
      <div className="mt-auto px-1">
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
    </aside>
  )
}

export default function App() {
  return (
    <UserProvider>
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
    </UserProvider>
  )
}
