import { createFileRoute } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { demoNotes } from "@/data/demo-data"
import { Plus, Folder, FileText, Clock, MoreHorizontal } from "lucide-react"

const folders = ["全部", "技术", "投资", "生活", "想法"]

function NotesPage() {
  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">笔记</h1>
          <p className="text-surface-500 text-sm mt-1">Markdown 知识库</p>
        </div>
        <Button><Plus size={16} />新建笔记</Button>
      </div>

      <div className="flex gap-4">
        {/* Folder Sidebar */}
        <Card className="w-44 shrink-0 self-start">
          <CardContent className="p-3 space-y-1">
            {folders.map((folder, i) => (
              <button
                key={folder}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                  i === 0
                    ? "bg-primary-50 text-primary-700 font-medium"
                    : "text-surface-600 hover:bg-surface-100"
                }`}
              >
                <Folder size={15} />
                <span>{folder}</span>
                {i === 0 && (
                  <span className="ml-auto text-xs bg-surface-200 text-surface-600 px-1.5 py-0.5 rounded-full">
                    {demoNotes.length}
                  </span>
                )}
              </button>
            ))}
          </CardContent>
        </Card>

        {/* Notes Grid */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
          {demoNotes.map((note) => (
            <Card key={note.id} className="hover:shadow-md transition-all cursor-pointer group">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <FileText size={18} className="text-primary-500" />
                    <CardTitle className="text-base">{note.title}</CardTitle>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity text-surface-400 hover:text-surface-600">
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-surface-500 line-clamp-3 leading-relaxed">{note.content}</p>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-surface-100">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="default" className="text-[10px]">{note.folder}</Badge>
                    {note.tags.map((tag) => (
                      <span key={tag} className="text-[10px] text-surface-400 bg-surface-100 px-1.5 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="flex items-center gap-1 text-[10px] text-surface-400">
                    <Clock size={10} />{note.updatedAt}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/notes")({
  component: NotesPage,
})
