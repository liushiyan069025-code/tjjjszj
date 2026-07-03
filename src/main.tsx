import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AdminPage } from './pages/AdminPage.tsx'

/** 基于 hash 的简易路由：#admin → 后台管理，其他 → 正常应用 */
function useHashRoute() {
  const [isAdmin, setIsAdmin] = useState(() => window.location.hash === '#admin')
  useEffect(() => {
    const onHashChange = () => setIsAdmin(window.location.hash === '#admin')
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return isAdmin
}

function Root() {
  const isAdmin = useHashRoute()
  if (isAdmin) return <AdminPage />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
