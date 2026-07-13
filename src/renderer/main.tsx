import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.js'
import ErrorBoundary from './components/ErrorBoundary.js'
import './index.css'
import './i18n/index.js'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
