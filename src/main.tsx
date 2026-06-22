import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'))
  } else {
    // A service worker should never cache Vite's changing development modules.
    navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(registration => registration.unregister()))
  }
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
