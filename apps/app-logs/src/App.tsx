import { useState, useRef, useEffect } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import ArticleIcon from '@mui/icons-material/Article';
import SearchIcon from '@mui/icons-material/Search';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FileDownloadIcon from '@mui/icons-material/FileDownload';

const GRADIENT = 'linear-gradient(135deg, #5BCFC4 0%, #1E5DA8 100%)';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  id: number;
  time: string;
  level: LogLevel;
  module: string;
  message: string;
}

const LEVEL_STYLES: Record<LogLevel, { color: string; bgcolor: string }> = {
  DEBUG: { color: '#888', bgcolor: 'rgba(136,136,136,0.08)' },
  INFO:  { color: '#1E5DA8', bgcolor: 'rgba(30,93,168,0.08)' },
  WARN:  { color: '#FF922B', bgcolor: 'rgba(255,146,43,0.08)' },
  ERROR: { color: '#FF6B6B', bgcolor: 'rgba(255,107,107,0.12)' },
};

const demoLogs: LogEntry[] = [
  { id: 1, time: '09:00:01.123', level: 'INFO', module: 'mail-sync', message: '邮件同步服务启动，开始检查新邮件...' },
  { id: 2, time: '09:00:02.456', level: 'DEBUG', module: 'imap', message: '连接 IMAP 服务器 imap.example.com:993' },
  { id: 3, time: '09:00:03.789', level: 'INFO', module: 'imap', message: 'IMAP 连接成功，认证通过' },
  { id: 4, time: '09:00:05.012', level: 'INFO', module: 'mail-sync', message: '开始同步收件箱，共 156 封邮件待处理' },
  { id: 5, time: '09:00:06.234', level: 'DEBUG', module: 'db', message: '查询数据库：SELECT * FROM emails WHERE folder="INBOX"' },
  { id: 6, time: '09:00:07.567', level: 'WARN', module: 'mail-sync', message: '检测到 3 封重复邮件，已自动跳过' },
  { id: 7, time: '09:00:10.890', level: 'INFO', module: 'mail-sync', message: '新增 12 封邮件到本地数据库' },
  { id: 8, time: '09:00:11.111', level: 'DEBUG', module: 'task', message: '触发任务：处理新邮件通知' },
  { id: 9, time: '09:00:12.222', level: 'ERROR', module: 'mail-sync', message: '同步失败：网络超时 (ETIMEDOUT)，将在 30s 后重试' },
  { id: 10, time: '09:00:15.333', level: 'INFO', module: 'general', message: '系统健康检查通过' },
  { id: 11, time: '09:00:18.444', level: 'DEBUG', module: 'db', message: '执行 VACUUM 操作，释放空间 12MB' },
  { id: 12, time: '09:00:20.555', level: 'INFO', module: 'mail-sync', message: '重试同步成功，完成剩余邮件下载' },
  { id: 13, time: '09:00:22.666', level: 'WARN', module: 'task', message: '任务队列堆积，当前排队数: 5' },
  { id: 14, time: '09:00:25.777', level: 'INFO', module: 'task', message: '任务 "发送日报" 已完成，耗时 1.2s' },
  { id: 15, time: '09:00:28.888', level: 'DEBUG', module: 'imap', message: 'IDLE 模式已激活，等待服务器推送' },
  { id: 16, time: '09:00:35.999', level: 'INFO', module: 'mail-sync', message: '收到服务器推送：收件箱有 2 封新邮件' },
  { id: 17, time: '09:00:36.101', level: 'DEBUG', module: 'db', message: 'INSERT INTO emails (uid, subject, from_addr) VALUES (...)' },
  { id: 18, time: '09:00:37.202', level: 'ERROR', module: 'db', message: '写入失败：磁盘空间不足 (ENOSPC)' },
  { id: 19, time: '09:00:38.303', level: 'WARN', module: 'general', message: '磁盘使用率已达 92%，建议清理' },
  { id: 20, time: '09:00:40.404', level: 'INFO', module: 'task', message: '启动清理任务：压缩旧日志文件' },
  { id: 21, time: '09:00:42.505', level: 'DEBUG', module: 'db', message: '清理完成，释放空间 256MB' },
  { id: 22, time: '09:00:45.606', level: 'INFO', module: 'mail-sync', message: '重试写入成功，2 封新邮件已保存' },
  { id: 23, time: '09:00:48.707', level: 'DEBUG', module: 'imap', message: '心跳包发送正常' },
  { id: 24, time: '09:00:50.808', level: 'INFO', module: 'general', message: '内存使用: 128MB / 512MB (25%)' },
  { id: 25, time: '09:00:55.909', level: 'WARN', module: 'mail-sync', message: '附件下载队列中有大文件 (>50MB): invoice_2025Q2.pdf' },
  { id: 26, time: '09:01:00.010', level: 'INFO', module: 'task', message: '定时任务 "周报汇总" 触发' },
  { id: 27, time: '09:01:05.121', level: 'DEBUG', module: 'db', message: '查询本周数据统计... 返回 89 条记录' },
  { id: 28, time: '09:01:10.232', level: 'ERROR', module: 'task', message: '周报生成失败：模板渲染错误 (TemplateSyntaxError)' },
];

const LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
const MODULES = ['all', 'mail-sync', 'imap', 'db', 'task', 'general'];

export default function App() {
  const [selectedLevels, setSelectedLevels] = useState<LogLevel[]>(['DEBUG', 'INFO', 'WARN', 'ERROR']);
  const [selectedModule, setSelectedModule] = useState('all');
  const [searchText, setSearchText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredLogs = demoLogs.filter(log => {
    if (!selectedLevels.includes(log.level)) return false;
    if (selectedModule !== 'all' && log.module !== selectedModule) return false;
    if (searchText && !log.message.toLowerCase().includes(searchText.toLowerCase()) &&
        !log.module.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  const toggleLevel = (level: LogLevel) => {
    setSelectedLevels(prev =>
      prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
    );
  };

  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filteredLogs.length, autoScroll]);

  const levelCount = (level: LogLevel) => demoLogs.filter(l => l.level === level).length;

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: 'auto', display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      {/* 标题 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexShrink: 0 }}>
        <ArticleIcon sx={{ fontSize: 32, color: '#1E5DA8' }} />
        <Typography variant="h5" fontWeight="bold" sx={{ background: GRADIENT, backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          日志
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          共 {filteredLogs.length} / {demoLogs.length} 条
        </Typography>
      </Box>

      {/* 筛选栏 */}
      <Card sx={{ borderRadius: 3, mb: 2, flexShrink: 0 }}>
        <Box sx={{ p: 2 }}>
          {/* 第一行：级别选择 + 搜索 */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5, alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>级别：</Typography>
            {LEVELS.map(level => (
              <Chip
                key={level}
                label={`${level} (${levelCount(level)})`}
                size="small"
                onClick={() => toggleLevel(level)}
                variant={selectedLevels.includes(level) ? 'filled' : 'outlined'}
                sx={{
                  fontSize: 12,
                  fontWeight: 'bold',
                  ...(selectedLevels.includes(level)
                    ? { color: '#fff', bgcolor: LEVEL_STYLES[level].color }
                    : { color: LEVEL_STYLES[level].color, borderColor: LEVEL_STYLES[level].color }),
                }}
              />
            ))}
            <Box sx={{ flexGrow: 1 }} />
            <TextField
              size="small"
              placeholder="搜索日志..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              sx={{ width: 220 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 18, color: '#999' }} />
                    </InputAdornment>
                  ),
                  sx: { fontSize: 13 },
                },
              }}
            />
          </Box>

          {/* 第二行：模块 + 操作按钮 */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">模块：</Typography>
            <Select
              size="small"
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              sx={{ minWidth: 140, fontSize: 13 }}
            >
              {MODULES.map(m => (
                <MenuItem key={m} value={m} sx={{ fontSize: 13 }}>
                  {m === 'all' ? '全部模块' : m}
                </MenuItem>
              ))}
            </Select>
            <Box sx={{ flexGrow: 1 }} />
            <FormControlLabel
              control={
                <Switch size="small" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
              }
              label={<Typography variant="caption">自动滚动</Typography>}
              sx={{ mr: 1, '& .MuiFormControlLabel-label': { fontSize: 12 } }}
            />
            <Button size="small" startIcon={<DeleteOutlineIcon />} sx={{ textTransform: 'none', fontSize: 12 }}>
              清空
            </Button>
            <Button size="small" startIcon={<FileDownloadIcon />} variant="outlined" sx={{ textTransform: 'none', fontSize: 12 }}>
              导出
            </Button>
          </Box>
        </Box>
      </Card>

      {/* 日志列表 */}
      <Card sx={{ borderRadius: 3, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box
          ref={listRef}
          sx={{
            flex: 1,
            overflowY: 'auto',
            fontFamily: '"Consolas", "Monaco", "Courier New", monospace',
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          {filteredLogs.map((log) => {
            const style = LEVEL_STYLES[log.level];
            return (
              <Box
                key={log.id}
                sx={{
                  px: 2,
                  py: 0.5,
                  borderBottom: '1px solid rgba(0,0,0,0.04)',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' },
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  bgcolor: log.level === 'ERROR' ? style.bgcolor : 'transparent',
                }}
              >
                <Typography component="span" sx={{ color: '#999', fontFamily: 'inherit', fontSize: 'inherit' }}>
                  [{log.time}]
                </Typography>{' '}
                <Typography
                  component="span"
                  sx={{
                    color: style.color,
                    fontWeight: 'bold',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    px: 0.75,
                    py: 0.125,
                    borderRadius: 0.5,
                    bgcolor: style.bgcolor,
                  }}
                >
                  [{log.level}]
                </Typography>{' '}
                <Typography component="span" sx={{ color: '#666', fontFamily: 'inherit', fontSize: 'inherit' }}>
                  [{log.module}]
                </Typography>{' '}
                <Typography component="span" sx={{ color: log.level === 'DEBUG' ? '#999' : '#333', fontFamily: 'inherit', fontSize: 'inherit' }}>
                  {log.message}
                </Typography>
              </Box>
            );
          })}
          {filteredLogs.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 6, color: '#999' }}>
              <Typography>无匹配的日志记录</Typography>
            </Box>
          )}
        </Box>
      </Card>
    </Box>
  );
}
