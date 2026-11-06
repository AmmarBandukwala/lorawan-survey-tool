import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import '../styles/survey.css'
import App from './App'

const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('App mount point not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
