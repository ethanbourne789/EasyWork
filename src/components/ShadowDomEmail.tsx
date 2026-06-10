import { useRef, useEffect } from "react"

interface ShadowDomEmailProps {
  html: string
  className?: string
}

/**
 * Renders HTML email content inside a Shadow DOM to prevent
 * email CSS from leaking into the application and to provide
 * basic XSS isolation.
 *
 * The Shadow DOM is created via attachShadow({ mode: "open" })
 * and the HTML is set via innerHTML on the shadow root.
 */
export function ShadowDomEmail({ html, className }: ShadowDomEmailProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const shadowRootRef = useRef<ShadowRoot | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Create shadow root only once
    if (!shadowRootRef.current) {
      shadowRootRef.current = container.attachShadow({ mode: "open" })
    }

    const shadow = shadowRootRef.current

    // Sanitize: remove scripts, event handlers, and iframes
    const sanitized = sanitizeHtml(html)

    // Reset base styles to ensure readable content in any theme
    shadow.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #1a1a2e;
          background: transparent;
          overflow-wrap: break-word;
          word-wrap: break-word;
        }
        img {
          max-width: 100%;
          height: auto;
        }
        a {
          color: #2563eb;
        }
        blockquote {
          border-left: 3px solid #d1d5db;
          margin: 8px 0;
          padding: 4px 12px;
          color: #6b7280;
        }
        pre {
          background: #f3f4f6;
          padding: 8px 12px;
          border-radius: 4px;
          overflow-x: auto;
        }
        table {
          border-collapse: collapse;
          max-width: 100%;
        }
        td, th {
          border: 1px solid #e5e7eb;
          padding: 6px 10px;
        }
      </style>
      ${sanitized}
    `
  }, [html])

  return <div ref={containerRef} className={className} />
}

/**
 * Basic HTML sanitization:
 * - Remove <script> tags
 * - Remove on* event handler attributes
 * - Remove <iframe> tags
 * - Remove javascript: URLs
 */
function sanitizeHtml(html: string): string {
  return html
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove on* event handlers
    .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // Remove javascript: URLs
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
    .replace(/src\s*=\s*["']javascript:[^"']*["']/gi, 'src="#"')
    // Remove iframes
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    // Remove <object> and <embed>
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*\/?>/gi, "")
}
