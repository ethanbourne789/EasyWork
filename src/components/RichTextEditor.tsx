import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Image from "@tiptap/extension-image"
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Quote, Undo, Redo, Heading1, Heading2, ImageIcon,
} from "lucide-react"

interface RichTextEditorProps {
  content: string
  onChange: (html: string, text: string) => void
  placeholder?: string
  /** 是否显示图片上传按钮 */
  showImageButton?: boolean
}

export function RichTextEditor({ content, onChange, placeholder = "邮件内容...", showImageButton }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
      }),
      Placeholder.configure({ placeholder }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML(), editor.getText())
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[200px] px-4 py-3 text-sm",
      },
    },
  })

  if (!editor) return null

  const handleImageUpload = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    input.multiple = true
    input.onchange = () => {
      const files = Array.from(input.files || [])
      files.forEach(file => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string
          editor.chain().focus().setImage({ src: dataUrl }).run()
        }
        reader.readAsDataURL(file)
      })
    }
    input.click()
  }

  return (
    <div className="border border-surface-200 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-surface-200 bg-surface-50 flex-wrap">
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="粗体">
          <Bold size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="斜体">
          <Italic size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="删除线">
          <Strikethrough size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="代码">
          <Code size={15} />
        </ToolbarBtn>
        <div className="w-px h-4 bg-surface-300 mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="标题1">
          <Heading1 size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="标题2">
          <Heading2 size={15} />
        </ToolbarBtn>
        <div className="w-px h-4 bg-surface-300 mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="无序列表">
          <List size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="有序列表">
          <ListOrdered size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="引用">
          <Quote size={15} />
        </ToolbarBtn>
        {showImageButton && (
          <>
            <div className="w-px h-4 bg-surface-300 mx-1" />
            <ToolbarBtn onClick={handleImageUpload} title="插入图片">
              <ImageIcon size={15} />
            </ToolbarBtn>
          </>
        )}
        <div className="flex-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="撤销">
          <Undo size={15} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title="重做">
          <Redo size={15} />
        </ToolbarBtn>
      </div>
      {/* Editor content */}
      <EditorContent editor={editor} />
    </div>
  )
}

function ToolbarBtn({ onClick, active, title, children }: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${active ? "bg-primary-100 text-primary-700" : "text-surface-500 hover:bg-surface-200 hover:text-surface-700"}`}
    >
      {children}
    </button>
  )
}
