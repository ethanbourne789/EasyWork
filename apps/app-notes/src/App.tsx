import React, { useState } from 'react';
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
  Paper,
  IconButton,
  TextField,
  Divider,
  Collapse,
  Button,
  Tooltip,
} from '@mui/material';
import {
  Work as WorkIcon,
  School as SchoolIcon,
  EditNote as NoteIcon,
  AutoStories as DiaryIcon,
  ExpandLess,
  ExpandMore,
  FormatBold,
  FormatItalic,
  FormatListBulleted,
  FormatListNumbered,
  Title as TitleIcon,
  Search as SearchIcon,
  Add as AddIcon,
} from '@mui/icons-material';

interface NoteItem {
  id: number;
  title: string;
  tags: string[];
  updateTime: string;
  category: string;
  preview: string;
}

interface CategoryItem {
  name: string;
  icon: React.ReactElement;
  count: number;
  children?: { name: string; count: number }[];
}

const categories: CategoryItem[] = [
  {
    name: '工作笔记', icon: <WorkIcon />, count: 3,
    children: [
      { name: '会议记录', count: 1 },
      { name: '项目文档', count: 1 },
      { name: '技术方案', count: 1 },
    ],
  },
  {
    name: '学习笔记', icon: <SchoolIcon />, count: 5,
    children: [
      { name: 'React 进阶', count: 2 },
      { name: 'TypeScript', count: 1 },
      { name: '系统设计', count: 1 },
      { name: '算法笔记', count: 1 },
    ],
  },
  {
    name: '生活随笔', icon: <NoteIcon />, count: 2,
    children: [
      { name: '旅行记录', count: 1 },
      { name: '读书心得', count: 1 },
    ],
  },
  {
    name: '日记本', icon: <DiaryIcon />, count: 4,
    children: [
      { name: '2026年6月', count: 4 },
    ],
  },
];

const demoNotes: NoteItem[] = [
  {
    id: 1, title: 'Q2 项目复盘总结',
    tags: ['工作', '项目'], category: '工作笔记',
    updateTime: '2026-06-10 09:30',
    preview: '本季度完成了三个核心模块的开发，整体进度符合预期。主要成果包括用户中心重构、支付流程优化和数据分析看板搭建...',
  },
  {
    id: 2, title: 'React Server Components 学习笔记',
    tags: ['学习', 'React', 'RSC'], category: '学习笔记',
    updateTime: '2026-06-09 20:15',
    preview: 'RSC 是 React 团队推出的一种新的组件模型，允许在服务器端渲染组件。核心概念包括 Server Component 和 Client Component 的区分...',
  },
  {
    id: 3, title: '杭州西湖游记',
    tags: ['生活', '旅行'], category: '生活随笔',
    updateTime: '2026-06-08 18:40',
    preview: '周末去了杭州西湖，断桥残雪果然名不虚传。清晨的湖面雾气缭绕，远山如黛，让人心旷神怡...',
  },
  {
    id: 4, title: 'TypeScript 泛型深入理解',
    tags: ['学习', 'TypeScript'], category: '学习笔记',
    updateTime: '2026-06-07 22:10',
    preview: '泛型是 TypeScript 中最强大的特性之一。通过泛型，我们可以编写可复用的、类型安全的代码。本文整理了常用的泛型模式...',
  },
  {
    id: 5, title: '周会纪要 - 2026年第23周',
    tags: ['工作', '会议'], category: '工作笔记',
    updateTime: '2026-06-06 16:00',
    preview: '参会人员：全体开发组。议题：1. 版本发布计划确认 2. 技术债务清理方案 3. 新人培训安排...',
  },
  {
    id: 6, title: '系统设计：分布式缓存架构',
    tags: ['学习', '架构', 'Redis'], category: '学习笔记',
    updateTime: '2026-06-05 21:30',
    preview: '在大型系统中，缓存是提升性能的关键手段。本文讨论了多级缓存架构设计，包括本地缓存 + 分布式缓存的组合策略...',
  },
  {
    id: 7, title: '《原子习惯》读后感',
    tags: ['生活', '阅读'], category: '生活随笔',
    updateTime: '2026-06-04 19:20',
    preview: '这本书改变了我对习惯养成的认知。作者提出的"1%的改进"理念让我意识到，每天微小的进步积累起来就是巨大的改变...',
  },
  {
    id: 8, title: '日记 - 忙碌而充实的一天',
    tags: ['日记'], category: '日记本',
    updateTime: '2026-06-03 23:00',
    preview: '今天从早忙到晚，但感觉很充实。上午完成了两个 PR 的 review，下午参加了产品评审会，晚上自学了 Rust 基础语法...',
  },
];

const tagColors: Record<string, string> = {
  '工作': '#1976d2',
  '学习': '#2e7d32',
  '生活': '#ed6c02',
  '旅行': '#9c27b0',
  'React': '#61dafb',
  'RSC': '#7c4dff',
  'TypeScript': '#3178c6',
  '项目': '#f57c00',
  '会议': '#455a64',
  '架构': '#00897b',
  'Redis': '#dc382d',
  '阅读': '#7b1fa2',
  '日记': '#5c6bc0',
};

export default function App() {
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['工作笔记']);
  const [selectedCategory, setSelectedCategory] = useState('工作笔记');
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(1);
  const [searchText, setSearchText] = useState('');

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const filteredNotes = demoNotes.filter(
    (note) =>
      note.category === selectedCategory &&
      (searchText === '' || note.title.includes(searchText) || note.tags.some((t) => t.includes(searchText)))
  );

  const selectedNote = demoNotes.find((n) => n.id === selectedNoteId);

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#f5f5f5' }}>
      {/* 左栏 - 目录树 */}
      <Box
        sx={{
          width: 240,
          borderRight: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* 头部 */}
        <Box sx={{ p: 2, pb: 1.5 }}>
          <Typography variant="h6" fontWeight={600}>
            📝 笔记
          </Typography>
        </Box>

        {/* 搜索框 */}
        <Box sx={{ px: 2, pb: 1.5 }}>
          <TextField
            size="small"
            placeholder="搜索笔记..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: <SearchIcon sx={{ fontSize: 18, color: 'text.secondary', mr: 1 }} />,
              sx: { fontSize: 13 },
            }}
          />
        </Box>

        {/* 目录树 */}
        <List sx={{ flex: 1, overflowY: 'auto', px: 1 }}>
          {categories.map((cat) => {
            const expanded = expandedCategories.includes(cat.name);
            return (
              <Box key={cat.name}>
                <ListItemButton
                  onClick={() => toggleCategory(cat.name)}
                  onDoubleClick={() => setSelectedCategory(cat.name)}
                  sx={{
                    borderRadius: 1.5,
                    py: 0.75,
                    '&.Mui-selected': { bgcolor: 'primary.light', color: 'primary.contrastText' },
                  }}
                  selected={selectedCategory === cat.name && !expanded}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{cat.icon}</ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="body2" fontWeight={500}>
                          {cat.name}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Typography variant="caption" color={selectedCategory === cat.name ? 'inherit' : 'text.secondary'}>
                            {cat.count}
                          </Typography>
                          {expanded ? <ExpandLess sx={{ fontSize: 18 }} /> : <ExpandMore sx={{ fontSize: 18 }} />}
                        </Box>
                      </Box>
                    }
                  />
                </ListItemButton>

                <Collapse in={expanded} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding sx={{ pl: 2 }}>
                    {cat.children?.map((child) => (
                      <ListItemButton
                        key={child.name}
                        selected={selectedCategory === cat.name}
                        onClick={() => setSelectedCategory(cat.name)}
                        dense
                        sx={{
                          borderRadius: 1.5,
                          py: 0.5,
                          mx: 0.5,
                          '&.Mui-selected': { bgcolor: 'action.selected' },
                        }}
                      >
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Typography variant="body2">{child.name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {child.count}
                              </Typography>
                            </Box>
                          }
                        />
                      </ListItemButton>
                    ))}
                  </List>
                </Collapse>
              </Box>
            );
          })}
        </List>

        <Divider />
        <Box sx={{ p: 1.5 }}>
          <Button fullWidth startIcon={<AddIcon />} size="small" variant="outlined">
            新建笔记
          </Button>
        </Box>
      </Box>

      {/* 右栏 */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 上半部分 - 笔记列表 */}
        <Box
          sx={{
            height: '45%',
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ p: 2, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {selectedCategory}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                共 {filteredNotes.length} 条笔记
              </Typography>
            </Box>
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto', px: 2, pb: 1 }}>
            {filteredNotes.map((note) => (
              <Paper
                key={note.id}
                elevation={0}
                onClick={() => setSelectedNoteId(note.id)}
                sx={{
                  p: 1.8,
                  mb: 1.2,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: selectedNoteId === note.id ? 'primary.main' : 'divider',
                  borderRadius: 2,
                  bgcolor: selectedNoteId === note.id ? 'action.selected' : 'transparent',
                  transition: 'all 0.15s ease',
                  '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
                }}
              >
                <Typography variant="subtitle2" fontWeight={600} noWrap gutterBottom>
                  {note.title}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    mb: 1,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: 1.5,
                    fontSize: 12.5,
                  }}
                >
                  {note.preview}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 'auto' }}>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {note.tags.map((tag) => (
                      <Chip
                        key={tag}
                        label={tag}
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: 11,
                          bgcolor: `${tagColors[tag] || 'grey.400'}20`,
                          color: tagColors[tag] || 'text.secondary',
                          fontWeight: 500,
                          '& .MuiChip-label': { px: 1 },
                        }}
                      />
                    ))}
                  </Box>
                  <Typography variant="caption" color="text.disabled" whiteSpace="nowrap" sx={{ ml: 1 }}>
                    {note.updateTime.split(' ')[0]}
                  </Typography>
                </Box>
              </Paper>
            ))}
          </Box>
        </Box>

        {/* 下半部分 - 编辑器占位区 */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: '#fff', overflow: 'hidden' }}>
          {/* 工具栏 */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.3,
              p: 1,
              pl: 2,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'grey.50',
            }}
          >
            {[
              { icon: <TitleIcon />, label: '标题' },
              { icon: <FormatBold />, label: '加粗' },
              { icon: <FormatItalic />, label: '斜体' },
              { icon: <FormatListBulleted />, label: '无序列表' },
              { icon: <FormatListNumbered />, label: '有序列表' },
            ].map((tool) => (
              <Tooltip key={tool.label} title={tool.label} arrow>
                <IconButton size="small" sx={{ borderRadius: 1, p: 0.8 }}>
                  {tool.icon}
                </IconButton>
              </Tooltip>
            ))}
            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
            <Tooltip title="插入图片" arrow>
              <IconButton size="small" sx={{ borderRadius: 1, p: 0.8 }}>🖼️</IconButton>
            </Tooltip>
            <Tooltip title="插入链接" arrow>
              <IconButton size="small" sx={{ borderRadius: 1, p: 0.8 }}>🔗</IconButton>
            </Tooltip>
            <Tooltip title="插入代码块" arrow>
              <IconButton size="small" sx={{ borderRadius: 1, p: 0.8 }}>&lt;/&gt;</IconButton>
            </Tooltip>
          </Box>

          {/* 编辑区域 */}
          <Box sx={{ flex: 1, p: 3, overflowY: 'auto' }}>
            {selectedNote ? (
              <>
                <TextField
                  fullWidth
                  defaultValue={selectedNote.title}
                  placeholder="输入标题..."
                  InputProps={{
                    sx: { typography: 'h5', fontWeight: 700, mb: 2, '& input': { padding: 0 } },
                    disableUnderline: true,
                  }}
                  variant="standard"
                />
                <TextField
                  fullWidth
                  multiline
                  minRows={10}
                  maxRows={Infinity}
                  defaultValue={selectedNote.preview}
                  placeholder="开始书写你的想法..."
                  InputProps={{
                    sx: { lineHeight: 1.8, '& textarea': { resize: 'none' } },
                    disableUnderline: true,
                  }}
                  variant="standard"
                />
              </>
            ) : (
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'text.disabled',
                  gap: 1,
                }}
              >
                <NoteIcon sx={{ fontSize: 48, opacity: 0.3 }} />
                <Typography>选择或创建一篇笔记开始编辑</Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
