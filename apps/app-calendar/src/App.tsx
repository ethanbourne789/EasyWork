import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayIcon from '@mui/icons-material/Today';

/* ---------- 类型定义 ---------- */

type EventType = 'schedule' | 'task' | 'accounting' | 'sports';

interface CalendarEvent {
  date: string; // YYYY-MM-DD
  title: string;
  type: EventType;
}

const EVENT_TYPE_CONFIG: Record<EventType, { label: string; color: string }> = {
  schedule: { label: '\u65E5\u7A0B', color: '#1E5DA8' },
  task:     { label: '\u4EFB\u52A1', color: '#51CF66' },
  accounting:{label: '\u8BB0\u8D26', color: '#FF922B' },
  sports:   { label: '\u8FD0\u52A8', color: '#9775FA' },
};

const WEEKDAY_LABELS = ['\u65E5', '\u4E00', '\u4E8C', '\u4E09', '\u56DB', '\u4E94', '\u516D'];

/* ---------- Demo 事件数据 (2026年6月) ---------- */

const DEMO_EVENTS: CalendarEvent[] = [
  { date: '2026-06-01', title: '\u6708\u5EA6\u542F\u52A8\u4F1A', type: 'schedule' },
  { date: '2026-06-03', title: '\u4EA7\u54C1\u9700\u6C42\u8BC4\u5BA1', type: 'task' },
  { date: '2026-06-05', title: '\u5348\u9910\u652F\u51FA \u00A532', type: 'accounting' },
  { date: '2026-06-07', title: '\u6668\u8DD1 5km', type: 'sports' },
  { date: '2026-06-08', title: '\u56E2\u5efa\u6D3B\u52A8', type: 'schedule' },
  { date: '2026-06-09', title: '\u5B8C\u621B\u811A\u624B\u67B6', type: 'task' },
  { date: '2026-06-10', title: '\u56E2\u961F\u5468\u4F1A', type: 'schedule' },
  { date: '2026-06-10', title: '\u652F\u4ED8\u79DF\u91D1', type: 'accounting' },
  { date: '2026-06-12', title: '\u7EF4\u5EA62\u62A5\u544A\u63D0\u4EA4', type: 'task' },
  { date: '2026-06-14', title: '\u5065\u8EAB\u623F', type: 'sports' },
  { date: '2026-06-15', title: '\u7236\u4EB2\u8282\u793C\u7269 \u00A5299', type: 'accounting' },
  { date: '2026-06-16', title: '\u5BA2\u6237\u6C14\u544A\u4F1A', type: 'schedule' },
  { date: '2026-06-18', title: '\u4EE3\u7801\u5BA1\u67E5', type: 'task' },
  { date: '2026-06-20', title: '\u591C\u8DD1 3km', type: 'sports' },
  { date: '2026-06-22', title: '\u751F\u65E5\u805A\u9910 \u00A5188', type: 'accounting' },
  { date: '2026-06-25', title: 'Q2 \u590D\u76D8\u4F1A\u8BAE', type: 'schedule' },
  { date: '2026-06-27', title: '\u6E38\u6CF3\u8BAD\u7EC3', type: 'sports' },
  { date: '2026-06-30', title: '\u6708\u5EA6\u603B\u7ED3', type: 'task' },
];

/* ---------- 手写日期工具函数 ---------- */

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  // getDay(): 0=Sunday
  return new Date(year, month, 1).getDay();
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/* ---------- 子组件 ---------- */

interface DayCellProps {
  day: number | null;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  dateString: string;
  events: CalendarEvent[];
  onSelect: () => void;
}

function DayCell({ day, isCurrentMonth, isToday, isSelected, events, onSelect }: DayCellProps) {
  if (day === null) {
    return <Box sx={{ minHeight: 90 }} />;
  }

  const cfg = EVENT_TYPE_CONFIG;

  return (
    <Box
      onClick={onSelect}
      sx={{
        minHeight: 90,
        p: 0.75,
        border: isSelected ? '2px solid #5BCFC4' : '1px solid',
        borderColor: isSelected ? '#5BCFC4' : 'divider',
        borderRadius: 2,
        cursor: 'pointer',
        bgcolor: isToday ? '#5BCFC4' + '12' : isSelected ? '#5BCFC4' + '08' : 'transparent',
        transition: 'bgcolor 0.15s, border-color 0.15s',
        '&:hover': { bgcolor: '#5BCFC4' + '10' },
        opacity: isCurrentMonth ? 1 : 0.4,
      }}
    >
      {/* 日期数字 */}
      <Typography
        variant="body2"
        fontWeight={isToday || isSelected ? 700 : 500}
        sx={{
          color: isToday ? '#5BCFC4' : 'text.primary',
          display: 'inline-block',
          minWidth: 24,
          textAlign: 'center',
          borderRadius: '50%',
          bgcolor: isToday ? '#5BCFC4' + '20' : 'transparent',
          lineHeight: 1.6,
          fontSize: '0.85rem',
        }}
      >
        {day}
      </Typography>

      {/* 事件标签 */}
      <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {events.slice(0, 3).map((ev, i) => (
          <Box
            key={i}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.35,
              overflow: 'hidden',
            }}
          >
            <Box
              component="span"
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                flexShrink: 0,
                bgcolor: cfg[ev.type].color,
              }}
            />
            <Typography
              variant="caption"
              noWrap
              sx={{
                fontSize: '0.65rem',
                lineHeight: 1.3,
                color: cfg[ev.type].color,
                fontWeight: 600,
              }}
            >
              {ev.title.length > 6 ? ev.title.slice(0, 5) + '…' : ev.title}
            </Typography>
          </Box>
        ))}
        {events.length > 3 && (
          <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', pl: 0.6 }}>
            +{events.length - 3}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

/* ---------- 主组件 ---------- */

export default function App() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string>(
    `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  );

  /* 构建日历网格数据 */
  const calendarGrid = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month); // 0=Sun
    const daysInPrevMonth = getDaysInMonth(year, month - 1);

    const cells: Array<{ day: number | null; isCurrentMonth: boolean; dateString: string }> = [];

    // 上月填充
    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        dateString: `${year}-${pad(month)}-${pad(daysInPrevMonth - i)}`,
      });
    }
    // 当月日期
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        isCurrentMonth: true,
        dateString: `${year}-${pad(month + 1)}-${pad(d)}`,
      });
    }
    // 下月填充到填满 6 行 x 7 列 = 42 格
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({
        day: d,
        isCurrentMonth: false,
        dateString: `${year}-${pad(month + 2)}-${pad(d)}`,
      });
    }

    return cells;
  }, [year, month]);

  /* 按日期索引事件 */
  const eventMap = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    DEMO_EVENTS.forEach((ev) => {
      if (!map[ev.date]) map[ev.date] = [];
      (map[ev.date] ??= []).push(ev);
    });
    return map;
  }, []);

  /* 导航 */
  const goPrev = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else { setMonth(m => m - 1); }
  };
  const goNext = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else { setMonth(m => m + 1); }
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
  };

  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  /* 当天事件 */
  const selectedEvents = eventMap[selectedDate] || [];

  return (
    <Box sx={{ p: 3 }}>
      {/* ===== 月份导航栏 ===== */}
      <Card sx={{ borderRadius: 3, mb: 2.5 }}>
        <CardContent sx={{ py: 1.75 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <IconButton onClick={goPrev} sx={{ borderRadius: 2 }} aria-label="\u4E0A\u4E2A\u6708">
              <ChevronLeftIcon />
            </IconButton>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h6" fontWeight={700}>
                {year}\u5E74{month + 1}\u6708
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<TodayIcon />}
                onClick={goToday}
                sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 600 }}
              >
                \u4ECA\u5929
              </Button>
            </Box>

            <IconButton onClick={goNext} sx={{ borderRadius: 2 }} aria-label="\u4E0B\u4E2A\u6708">
              <ChevronRightIcon />
            </IconButton>
          </Box>
        </CardContent>
      </Card>

      <Grid container spacing={2.5}>
        {/* ===== 日历网格 ===== */}
        <Grid item xs={12} lg={8}>
          <Card sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent sx={{ '&:last': { pb: 1.5 }, pt: 1.5 }}>
              {/* 星期表头 */}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', mb: 0.5 }}>
                {WEEKDAY_LABELS.map((label, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      textAlign: 'center',
                      py: 0.5,
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      color: idx === 0 || idx === 6 ? '#FF6B6B' : 'text.secondary',
                    }}
                  >
                    {label}
                  </Box>
                ))}
              </Box>

              {/* 日期格子 */}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
                {calendarGrid.map((cell, idx) => (
                  <DayCell
                    key={idx}
                    day={cell.day}
                    isCurrentMonth={cell.isCurrentMonth}
                    isToday={cell.dateString === todayStr}
                    isSelected={cell.dateString === selectedDate}
                    dateString={cell.dateString}
                    events={eventMap[cell.dateString] || []}
                    onSelect={() => setSelectedDate(cell.dateString)}
                  />
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* ===== 侧边：选中日期详情 + 图例 ===== */}
        <Grid item xs={12} lg={4}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, height: '100%' }}>
            {/* 选中日期事件列表 */}
            <Card sx={{ borderRadius: 3, flex: 1 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
                  {selectedDate.replace(/-/g, '/')}
                </Typography>
                {selectedEvents.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                    \u6682\u65E0\u4E8B\u4EF6
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {selectedEvents.map((ev, i) => {
                      const c = EVENT_TYPE_CONFIG[ev.type];
                      return (
                        <Box
                          key={i}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            p: 1.25,
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: c.color + '40',
                            bgcolor: c.color + '08',
                          }}
                        >
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c.color, flexShrink: 0 }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600} noWrap>{ev.title}</Typography>
                            <Chip
                              size="small"
                              label={c.label}
                              sx={{
                                mt: 0.25,
                                height: 20,
                                fontSize: '0.65rem',
                                bgcolor: c.color + '1A',
                                color: c.color,
                                fontWeight: 700,
                              }}
                            />
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </CardContent>
            </Card>

            {/* 图例 */}
            <Card sx={{ borderRadius: 3 }}>
              <CardContent sx={{ py: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block', fontWeight: 600 }}>
                  \u4E8B\u4EF6\u7C7B\u578B
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {(Object.entries(EVENT_TYPE_CONFIG) as [EventType, typeof EVENT_TYPE_CONFIG[EventType]][]).map(
                    ([key, val]) => (
                      <Chip
                        key={key}
                        size="small"
                        icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: val.color, ml: 0.5 }} />}
                        label={val.label}
                        sx={{
                          height: 24,
                          fontSize: '0.72rem',
                          bgcolor: val.color + '12',
                          color: val.color,
                          fontWeight: 600,
                          borderRadius: 2,
                        }}
                      />
                    )
                  )}
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}

// Grid import (inline to avoid unused warning)
import Grid from '@mui/material/Grid';
