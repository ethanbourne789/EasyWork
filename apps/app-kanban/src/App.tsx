import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import AddIcon from '@mui/icons-material/Add';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';

type TaskStatus = 'todo' | 'doing' | 'done' | 'abandoned' | 'archived';

interface TaskItem {
  id: number;
  title: string;
  priority: 'high' | 'medium' | 'low';
  dueTime: string;
  assignee: string;
}

interface Column {
  key: TaskStatus;
  title: string;
  color: string;
  tasks: TaskItem[];
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  high: { label: '\u9AD8', color: '#FF6B6B' },
  medium: { label: '\u4E2D', color: '#FFD43B' },
  low: { label: '\u4FEE', color: '#51CF66' },
};

const DEMO_COLUMNS: Column[] = [
  {
    key: 'todo',
    title: '\u672A\u5F00\u59CB',
    color: '#9E9E9E',
    tasks: [
      { id: 1, title: '\u5B8C\u621B\u5B63\u5EA62\u62A5\u544A\u64B0\u5199', priority: 'high', dueTime: '2026-06-12', assignee: '\u5C0F\u660E' },
      { id: 2, title: '\u51C6\u5907\u5468\u4F1A\u6F14\u793APPT', priority: 'medium', dueTime: '2026-06-13', assignee: '\u5C0F\u7EA2' },
      { id: 3, title: '\u6574\u7406\u6280\u672F\u6587\u6863', priority: 'low', dueTime: '2026-06-15', assignee: '\u5C0F\u534E' },
    ],
  },
  {
    key: 'doing',
    title: '\u8FDB\u884C\u4E2D',
    color: '#5BCFC4',
    tasks: [
      { id: 4, title: '\u5F00\u53D1\u7528\u6237\u8BA4\u8BC1\u6A21\u5757', priority: 'high', dueTime: '2026-06-11', assignee: '\u5C0F\u660E' },
      { id: 5, title: '\u4F18\u5316\u6570\u636E\u5E93\u67E5\u8BE2\u6027\u80FD', priority: 'medium', dueTime: '2026-06-10', assignee: '\u5C0F\u521A' },
      { id: 6, title: '\u79FB\u52A8\u7AEF\u9002\u914D\u8C03\u6574', priority: 'low', dueTime: '2026-06-14', assignee: '\u5C0F\u7EA2' },
    ],
  },
  {
    key: 'done',
    title: '\u5DF2\u5B8C\u6210',
    color: '#51CF66',
    tasks: [
      { id: 7, title: '\u642D\u5EFA\u9879\u76EE\u811A\u624B\u67B6', priority: 'high', dueTime: '2026-06-09', assignee: '\u5C0F\u660E' },
      { id: 8, title: '\u8BBE\u8BA1\u6570\u636E\u5E93\u8868\u7ED3\u6784', priority: 'medium', dueTime: '2026-06-08', assignee: '\u5C0F\u521A' },
      { id: 9, title: '\u5199\u5B8C\u63A5\u53E3\u6587\u6863', priority: 'low', dueTime: '2026-06-07', assignee: '\u5C0F\u534E' },
    ],
  },
  {
    key: 'abandoned',
    title: '\u5DF2\u653E\u5F03',
    color: '#FF6B6B',
    tasks: [
      { id: 10, title: '\u8FC1\u79FB\u65E7\u7CFB\u7EDF\u6570\u636E', priority: 'low', dueTime: '', assignee: '\u5C0F\u534E' },
      { id: 11, title: '\u96C6\u6210\u7B2C\u4E09\u65B9SDK', priority: 'medium', dueTime: '', assignee: '\u5C0F\u521A' },
    ],
  },
  {
    key: 'archived',
    title: '\u5F52\u6863',
    color: '#78909C',
    tasks: [
      { id: 12, title: 'Q1 \u9879\u76EE\u590D\u76D8', priority: 'medium', dueTime: '2026-04-01', assignee: '\u5C0F\u7EA2' },
      { id: 13, title: '\u5E74\u5EA6\u603B\u7ED3\u62A5\u544A', priority: 'low', dueTime: '2026-03-15', assignee: '\u5C0F\u660E' },
    ],
  },
];

function TaskCard({ task }: { task: TaskItem }) {
  const pri = PRIORITY_CONFIG[task.priority] ?? { label: '中', color: '#FFD43B' };
  return (
    <Card
      sx={{
        mb: 1.5,
        cursor: 'grab',
        borderRadius: 2,
        transition: 'box-shadow 0.2s, transform 0.15s',
        '&:hover': { boxShadow: 4, transform: 'translateY(-1px)' },
      }}
    >
      <CardContent sx={{ p: 1.75, '&:last': { pb: 1.75 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, mb: 1 }}>
          <DragIndicatorIcon sx={{ fontSize: 18, color: 'text.disabled', mt: 0.15, cursor: 'grab', flexShrink: 0 }} />
          <Typography variant="body2" fontWeight={600} sx={{ flex: 1, lineHeight: 1.4 }}>{task.title}</Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', ml: 1.6 }}>
          <Chip
            size="small"
            label={pri.label}
            sx={{
              bgcolor: pri.color + '1A',
              color: pri.color,
              fontSize: '0.7rem',
              fontWeight: 700,
              height: 22,
            }}
          />
          {task.dueTime && (
            <Chip
              size="small"
              icon={
                <Box
                  component="span"
                  sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: new Date(task.dueTime) < new Date('2026-06-10') ? '#FF6B6B' : '#FFD43B',
                    ml: 0.5,
                  }}
                />
              }
              label={task.dueTime.slice(5)}
              sx={{ height: 22, fontSize: '0.7rem', color: 'text.secondary' }}
            />
          )}
          <Avatar
            sx={{
              width: 24,
              height: 24,
              bgcolor: '#1E5DA8',
              fontSize: '0.65rem',
              fontWeight: 700,
              ml: 'auto',
            }}
          >
            {task.assignee[0]}
          </Avatar>
        </Box>
      </CardContent>
    </Card>
  );
}

function KanbanColumn({ column }: { column: Column }) {
  return (
    <Box sx={{ width: 280, flexShrink: 0 }}>
      {/* 列标题 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 1.5,
          px: 0.5,
          py: 0.75,
          borderRadius: 2,
          bgcolor: column.color + '10',
        }}
      >
        <Box sx={{ width: 4, height: 18, borderRadius: 2, bgcolor: column.color }} />
        <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>{column.title}</Typography>
        <Chip
          size="small"
          label={String(column.tasks.length)}
          sx={{
            height: 22,
            fontSize: '0.7rem',
            fontWeight: 700,
            bgcolor: column.color + '20',
            color: column.color,
          }}
        />
        <IconButton size="small" sx={{ width: 28, height: 28 }}>
          <AddIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* 任务卡片列表 */}
      <Box sx={{ minHeight: 120, pr: 0.5 }}>
        {column.tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </Box>
    </Box>
  );
}

export default function App() {
  const [columns] = useState<Column[]>(DEMO_COLUMNS);

  return (
    <Box sx={{ p: 3 }}>
      {/* 页面标题 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>看板</Typography>
        <Chip
          size="small"
          label="\u62D6\u62FD\u6392\u5E8F \u00B7 \u5355\u51FB\u67E5\u770B"
          color="primary"
          variant="outlined"
          sx={{ borderRadius: 2 }}
        />
      </Box>

      {/* 泳道容器 - 横向滚动 */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          pb: 2,
          '&::-webkit-scrollbar': { height: 6 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'divider', borderRadius: 3 },
        }}
      >
        {columns.map((col) => (
          <KanbanColumn key={col.key} column={col} />
        ))}
      </Box>
    </Box>
  );
}
