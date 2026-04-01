import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const preventPinchZoom = () => {
  document.addEventListener('gesturestart', (event) => {
    event.preventDefault()
  })

  document.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length > 1) {
        event.preventDefault()
      }
    },
    { passive: false },
  )
}

preventPinchZoom()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
