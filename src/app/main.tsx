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

// Polyfill Uint8Array.prototype.toHex — required by pdfjs-dist v5+ on browsers
// < Chrome 123 (the Uint8Array to/from hex/base64 proposal). Without this,
// PDF parsing throws "UnknownErrorException: n.toHex is not a function"
// when computing the document fingerprint.
if (typeof Uint8Array !== 'undefined') {
  const up = Uint8Array.prototype as unknown as Record<string, unknown>
  if (!up['toHex']) {
    // eslint-disable-next-line no-extend-native
    up['toHex'] = function (this: Uint8Array) {
      return Array.from(this, (b) => b.toString(16).padStart(2, '0')).join('')
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
