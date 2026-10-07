import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './hooks/AuthProvider'
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt'
import { PwaInstallProvider } from './components/PwaInstall'
import './styles/global.css'
import './styles/chat-fix.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PwaInstallProvider>
      <AuthProvider>
        <BrowserRouter>
          <App />
          <PwaUpdatePrompt />
        </BrowserRouter>
      </AuthProvider>
    </PwaInstallProvider>
  </React.StrictMode>,
)
