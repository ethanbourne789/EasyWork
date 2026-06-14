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
 * Sanitize email HTML before rendering into the Shadow DOM.
 *
 * Bug #7 fix: the old implementation used a sequence of regex substitutions
 * that were trivially bypassable. Examples the previous regex missed:
 *   - Nested obfuscation: `<scr<script>ipt>alert(1)</script>` survives because
 *     the inner `<script>` is stripped first, leaving an intact `<script>`.
 *   - Whitespace inside tag: `<script\n>alert(1)</script>` was sometimes
 *     missed by `\b` boundaries.
 *   - Newline-separated event handlers: `<img src=x on\nerror=alert(1)>`.
 *   - Mixed-case `JaVaScRiPt:` URLs in `formaction`, `xlink:href`, etc.
 *
 * We now parse the HTML with the browser's DOMParser (so we leverage the
 * real HTML5 tokeniser), then walk the tree and drop dangerous nodes and
 * attributes. The result is serialized back to a string for the Shadow
 * DOM injection.
 */
function sanitizeHtml(html: string): string {
  // Use a template document so the parser runs in a fresh, isolated context
  // — no script execution, no style bleed into the host page.
  const doc = new DOMParser().parseFromString(html, "text/html")

  // Forbidden tags: completely remove (including their text content for
  // <script> / <style> which can carry executable code or CSS exfil).
  const FORBIDDEN_TAGS = new Set([
    "script", "style", "iframe", "object", "embed", "applet",
    "form", "input", "button", "textarea", "select", "option",
    "link", "meta", "base",
  ])
  doc.querySelectorAll(Array.from(FORBIDDEN_TAGS).join(",")).forEach((el) => {
    el.remove()
  })

  // Walk every remaining element and strip event-handler attributes plus
  // any attribute whose value starts with `javascript:` (case-insensitive,
  // allowing leading whitespace).
  const JS_URL = /^\s*javascript:/i
  const ALL_TAGS = doc.querySelectorAll("*")
  ALL_TAGS.forEach((el) => {
    // Build a snapshot because mutating attributes during iteration can skip entries
    const attrs = Array.from(el.attributes)
    for (const attr of attrs) {
      const name = attr.name.toLowerCase()
      const value = attr.value

      // 1) Inline event handlers (onclick, onload, onerror, onmouseover, …)
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name)
        continue
      }

      // 2) javascript: URLs in any href-like attribute. We cover the common
      //    cases: href, src, action, formaction, xlink:href. data: URIs are
      //    still allowed (used for cid: inline images in this product).
      if (
        (name === "href" || name === "src" || name === "action" ||
         name === "formaction" || name === "xlink:href" || name === "background") &&
        JS_URL.test(value)
      ) {
        el.setAttribute(attr.name, "#")
        continue
      }

      // 3) data: URIs in src/href can be used for XSS via SVG/HTML
      //    Only allow data: for images (data:image/...)
      if (
        (name === "src" || name === "href") &&
        /^\s*data:/i.test(value) &&
        !/^\s*data:image\//i.test(value)
      ) {
        el.setAttribute(attr.name, "#")
        continue
      }

      // 4) Remove style attributes that could contain expression() or url()
      //    with javascript: or data: URIs
      if (name === "style") {
        const styleValue = value.toLowerCase()
        if (
          /expression\s*\(/.test(styleValue) ||
          /javascript\s*:/i.test(styleValue) ||
          /url\s*\(\s*['"]?\s*javascript:/i.test(styleValue) ||
          /url\s*\(\s*['"]?\s*data:(?!image\/)/i.test(styleValue)
        ) {
          el.removeAttribute(attr.name)
        }
      }
    }

    // 5) Defensive: <a target="_blank"> without rel="noopener noreferrer"
    //    allows the opened page to navigate the opener. Tag-aware fixup.
    if (el.tagName === "A" && el.getAttribute("target") === "_blank") {
      const rel = el.getAttribute("rel") || ""
      const needed = ["noopener", "noreferrer"]
      const have = new Set(rel.split(/\s+/).filter(Boolean))
      needed.forEach((n) => { if (!have.has(n)) have.add(n) })
      el.setAttribute("rel", Array.from(have).join(" "))
    }
  })

  return doc.body.innerHTML
}
