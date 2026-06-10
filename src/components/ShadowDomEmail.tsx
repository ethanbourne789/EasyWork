import { useRef, useEffect, useState, useCallback } from "react"

interface ShadowDomEmailProps {
  html: string
  className?: string
  /** Map of content_id (without angle brackets) → data URL for inline images */
  cidMap?: Record<string, string>
  /** Whether to load remote images directly (default: true) */
  remoteImagesEnabled?: boolean
}

/**
 * Renders HTML email content inside a Shadow DOM to prevent
 * email CSS from leaking into the application and to provide
 * basic XSS isolation.
 *
 * Supports:
 * - CID inline image replacement
 * - Remote image blocking (click to show)
 */
export function ShadowDomEmail({ html, className, cidMap, remoteImagesEnabled = true }: ShadowDomEmailProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const shadowRootRef = useRef<ShadowRoot | null>(null)
  const [showRemoteImages, setShowRemoteImages] = useState(false)

  const renderContent = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    if (!shadowRootRef.current) {
      shadowRootRef.current = container.attachShadow({ mode: "open" })
    }

    const shadow = shadowRootRef.current
    const sanitized = sanitizeHtml(html)

    // Replace cid: references with data URLs
    const withCid = cidMap ? replaceCidRefs(sanitized, cidMap) : sanitized

    // Determine whether to block remote images
    // remoteImagesEnabled=true: show all images directly (no blocking)
    // remoteImagesEnabled=false: block remote images, show notification bar with button
    const shouldBlock = !remoteImagesEnabled && !showRemoteImages
    const finalHtml = shouldBlock ? blockRemoteImages(withCid) : withCid

    const hasRemoteImages = !remoteImagesEnabled && !showRemoteImages && hasRemoteImgTags(withCid)

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
      ${hasRemoteImages ? `<div id="remote-img-bar" style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;padding:6px 12px;margin-bottom:8px;font-size:12px;color:#6b7280;display:flex;align-items:center;gap:8px;">
        <span>🖼️ 邮件中包含远程图片</span>
        <button id="show-images-btn" style="background:#2563eb;color:white;border:none;border-radius:4px;padding:4px 10px;font-size:12px;cursor:pointer;">显示图片</button>
      </div>` : ""}
      ${finalHtml}
    `

    // Attach event listener for "show images" button
    if (hasRemoteImages) {
      const btn = shadow.querySelector("#show-images-btn")
      if (btn) {
        btn.addEventListener("click", () => setShowRemoteImages(true))
      }
    }
  }, [html, cidMap, showRemoteImages, remoteImagesEnabled])

  useEffect(() => {
    renderContent()
  }, [renderContent])

  return <div ref={containerRef} className={className} />
}

/**
 * Replace <img src="cid:xxx"> with inline data URLs from the cidMap.
 */
function replaceCidRefs(html: string, cidMap: Record<string, string>): string {
  return html.replace(/<img\s[^>]*src\s*=\s*["']cid:([^"']+)["'][^>]*\/?>/gi, (match, cid) => {
    const dataUrl = cidMap[cid] || cidMap[`<${cid}>`]
    if (dataUrl) {
      return match.replace(/src\s*=\s*["']cid:[^"']+["']/i, `src="${dataUrl}"`)
    }
    return match.replace(/src\s*=\s*["']cid:[^"']+["']/i, 'src=""')
  })
}

/**
 * Check if the HTML has any remote img tags (non-data, non-cid after replacement).
 */
function hasRemoteImgTags(html: string): boolean {
  const imgRegex = /<img\s[^>]*src\s*=\s*["'](?!data:|cid:)([^"']+)["']/gi
  return imgRegex.test(html)
}

/**
 * Replace remote image src with a placeholder to block tracking pixels.
 */
function blockRemoteImages(html: string): string {
  return html.replace(/<img\s[^>]*src\s*=\s*["'](?!data:|cid:)([^"']+)["']([^>]*)\/?>/gi, (_match, _src, rest) => {
    return `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E" data-remote-src="${escapeAttr(_src)}"${rest || ""} />`
  })
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
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
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"')
    .replace(/src\s*=\s*["']javascript:[^"']*["']/gi, 'src="#"')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*\/?>/gi, "")
}
