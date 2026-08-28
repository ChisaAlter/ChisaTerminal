/// <reference types="vite/client" />

/** Injected at build time from package.json (see vite.config.ts `define`). */
declare const __APP_VERSION__: string

declare module '*.css' {
  const content: string
  export default content
}

interface HTMLWebViewElement extends HTMLElement {
  src: string
  partition?: string
  nodeintegration?: boolean
  disablewebsecurity?: boolean
  allowpopups?: boolean
  webpreferences?: string
  useragent?: string
  reload: () => void
  getURL: () => string
  addEventListener: (
    type: 'did-start-loading' | 'did-stop-loading' | 'did-finish-load' | 'did-fail-load' | 'page-title-updated' | 'permissionrequest' | 'console-message' | 'certificate-error' | string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => void
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLWebViewElement>, HTMLWebViewElement>
    }
  }
}
