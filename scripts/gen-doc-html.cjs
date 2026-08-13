const fs = require("fs");
const path = require("path");
const { marked } = require("C:/Users/Ethan/.workbuddy/binaries/node/workspace/node_modules/marked");

const MD = "docs/EasyWork-技术文档.md";
const OUT = "docs/EasyWork-技术文档.html";

const raw = fs.readFileSync(MD, "utf8");

// 把 Mermaid 代码块包成 <div class="mermaid">，其余正常渲染
const renderer = new marked.Renderer();
marked.setOptions({ gfm: true, breaks: false, renderer });

let htmlBody = marked.parse(raw);

// 将 ```mermaid 代码块（marked 会渲染成 <pre><code class="language-mermaid">）转为 mermaid 容器
htmlBody = htmlBody.replace(
  /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
  (_m, code) => `<div class="mermaid">${code.replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<")}</div>`
);

// 让图片路径指向 assets/（文档里写的是 assets/xx.png，HTML 与 MD 同目录，直接用）
const tpl = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>EasyWork 技术文档（工程手册）</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<style>
  :root{
    --bg:#fbfbfa; --fg:#1f2328; --card:#fff; --brand:#5b54e6; --border:#e6e4e0;
    --muted:#6b7280; --code-bg:#f4f3f1; --table-stripe:#f7f7f5;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);
    font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
    line-height:1.7;font-size:15px}
  .wrap{max-width:960px;margin:0 auto;padding:48px 28px 120px}
  h1{font-size:30px;margin:0 0 6px;letter-spacing:-.5px}
  h2{font-size:23px;margin:46px 0 14px;padding-bottom:8px;border-bottom:2px solid var(--border)}
  h3{font-size:18px;margin:30px 0 10px;color:#2b2f36}
  h4{font-size:15.5px;margin:20px 0 8px;color:var(--brand)}
  p{margin:10px 0}
  a{color:var(--brand);text-decoration:none}
  code{background:var(--code-bg);padding:1.5px 6px;border-radius:5px;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:13px}
  pre{background:#1e1e2e;color:#e4e4e7;padding:16px 18px;border-radius:10px;overflow:auto;font-size:13px}
  pre code{background:none;padding:0;color:inherit}
  table{border-collapse:collapse;width:100%;margin:14px 0;font-size:13.5px;
    box-shadow:0 1px 2px rgba(0,0,0,.04)}
  th,td{border:1px solid var(--border);padding:8px 10px;text-align:left;vertical-align:top}
  th{background:#f0eefc;color:#3a2f8c;font-weight:600}
  tbody tr:nth-child(even){background:var(--table-stripe)}
  blockquote{border-left:4px solid var(--brand);margin:14px 0;padding:6px 16px;background:#f6f5ff;color:#444}
  img{max-width:100%;border:1px solid var(--border);border-radius:10px;margin:14px 0;
    box-shadow:0 4px 16px rgba(0,0,0,.08)}
  .mermaid{background:#fff;border:1px solid var(--border);border-radius:10px;padding:18px;margin:18px 0;
    overflow:auto;text-align:center}
  hr{border:none;border-top:1px solid var(--border);margin:36px 0}
  ul,ol{padding-left:22px}
  li{margin:4px 0}
  .toc{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px 22px;margin:20px 0}
  .toc h4{margin-top:0}
  .meta{color:var(--muted);font-size:13px;margin-bottom:18px}
  @media (max-width:640px){.wrap{padding:28px 16px 80px}}
</style>
</head>
<body>
<div class="wrap">
<div class="meta">EasyWork 技术文档 · 工程手册 · 生成于 2026-08-11 · 配套截图见 <code>docs/assets/</code></div>
${htmlBody}
</div>
<script>
  if (window.mermaid){ mermaid.initialize({startOnLoad:true,theme:"default",securityLevel:"loose"}); }
</script>
</body>
</html>`;

fs.writeFileSync(OUT, tpl, "utf8");
console.log("written", OUT, fs.statSync(OUT).size, "bytes");
