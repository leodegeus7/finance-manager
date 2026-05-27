// Polyfill BigInt.prototype.toHex — required by pdfjs-dist v5+ on browsers < Chrome 121
if (typeof BigInt !== 'undefined') {
  const bp = BigInt.prototype as unknown as Record<string, unknown>
  if (!bp['toHex']) {
    // eslint-disable-next-line no-extend-native
    bp['toHex'] = function (this: unknown) {
      const hex = (this as bigint).toString(16)
      return hex.startsWith('-') ? '-' + hex.slice(1) : hex
    }
  }
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
