import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import DirectionsBikeIcon from '@mui/icons-material/DirectionsBike';
import TimerIcon from '@mui/icons-material/Timer';
import StraightenIcon from '@mui/icons-material/Straighten';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';

const GRADIENT = 'linear-gradient(135deg, #5BCFC4 0%, #1E5DA8 100%)';

interface Workout {
  id: number;
  type: string;
  typeLabel: string;
  icon: React.ReactNode;
  color: string;
  duration: number; // 分钟
  distance: number | null; // km
  calories: number;
  date: string;
  note: string;
}

const demoWorkouts: Workout[] = [
  { id: 1, type: 'run', typeLabel: '跑步', icon: <DirectionsRunIcon />, color: '#51CF66', duration: 45, distance: 6.2, calories: 380, date: '2025-06-10', note: '晨跑，配速7分15秒' },
  { id: 2, type: 'gym', typeLabel: '健身', icon: <FitnessCenterOutlinedIcon />, color: '#FF922B', duration: 60, distance: null, calories: 320, date: '2025-06-08', note: '上肢训练 + 核心' },
  { id: 3, type: 'bike', typeLabel: '骑行', icon: <DirectionsBikeIcon />, color: '#1E5DA8', duration: 50, distance: 18.0, calories: 420, date: '2025-06-07', note: '滨江绿道骑行' },
  { id: 4, type: 'run', typeLabel: '跑步', icon: <DirectionsRunIcon />, color: '#51CF66', duration: 35, distance: 5.0, calories: 280, date: '2025-06-05', note: '夜跑' },
  { id: 5, type: 'gym', typeLabel: '健身', icon: <FitnessCenterOutlinedIcon />, color: '#FF922B', duration: 55, distance: null, calories: 300, date: '2025-06-04', note: '下肢训练日' },
  { id: 6, type: 'run', typeLabel: '跑步', icon: <DirectionsRunIcon />, color: '#51CF66', duration: 40, distance: 5.5, calories: 310, date: '2025-06-02', note: '公园慢跑' },
  { id: 7, type: 'bike', typeLabel: '骑行', icon: <DirectionsBikeIcon />, color: '#1E5DA8', duration: 30, distance: 10.0, calories: 250, date: '2025-05-31', note: '通勤骑行' },
  { id: 8, type: 'gym', typeLabel: '健身', icon: <FitnessCenterOutlinedIcon />, color: '#FF922B', duration: 50, distance: null, calories: 270, date: '2025-05-29', note: '有氧 + 拉伸' },
  { id: 9, type: 'run', typeLabel: '跑步', icon: <DirectionsRunIcon />, color: '#51CF66', duration: 50, distance: 7.0, calories: 420, date: '2025-05-27', note: '长距离拉练' },
];

const weeklyGoal = 4;
const completedCount = demoWorkouts.filter(w => new Date(w.date) >= new Date('2025-06-03')).length;

export default function App() {
  const totalDuration = demoWorkouts.reduce((s, w) => s + w.duration, 0);
  const totalDistance = demoWorkouts.reduce((s, w) => s + (w.distance || 0), 0);
  const totalCalories = demoWorkouts.reduce((s, w) => s + w.calories, 0);

  const runCount = demoWorkouts.filter(w => w.type === 'run').length;
  const gymCount = demoWorkouts.filter(w => w.type === 'gym').length;
  const bikeCount = demoWorkouts.filter(w => w.type === 'bike').length;
  const totalCount = demoWorkouts.length;

  const distribution = [
    { label: '跑步', value: Math.round((runCount / totalCount) * 100), color: '#51CF66' },
    { label: '健身', value: Math.round((gymCount / totalCount) * 100), color: '#FF922B' },
    { label: '骑行', value: Math.round((bikeCount / totalCount) * 100), color: '#1E5DA8' },
  ];

  return (
    <Box sx={{ p: 3, maxWidth: 900, mx: 'auto' }}>
      {/* 标题 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <FitnessCenterIcon sx={{ fontSize: 32, color: '#1E5DA8' }} />
        <Typography variant="h5" fontWeight="bold" sx={{ background: GRADIENT, backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          运动
        </Typography>
      </Box>

      {/* 目标概览卡片 */}
      <Card sx={{ borderRadius: 3, mb: 3, overflow: 'hidden' }}>
        <Box sx={{
          background: GRADIENT,
          px: 3,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Box>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>本周运动目标</Typography>
            <Typography variant="h5" fontWeight="bold" color="#fff" sx={{ mt: 0.25 }}>
              已完成 {completedCount} / {weeklyGoal} 次
            </Typography>
          </Box>
          <Avatar sx={{
            width: 64,
            height: 64,
            bgcolor: 'rgba(255,255,255,0.2)',
            color: '#fff',
          }}>
            <EmojiEventsIcon sx={{ fontSize: 32 }} />
          </Avatar>
        </Box>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <LinearProgress
              variant="determinate"
              value={(completedCount / weeklyGoal) * 100}
              sx={{
                flex: 1,
                height: 12,
                borderRadius: 6,
                backgroundColor: 'rgba(94,207,196,0.2)',
                '& .MuiLinearProgress-bar': {
                  borderRadius: 6,
                  background: GRADIENT,
                },
              }}
            />
            <Typography variant="subtitle2" fontWeight="bold" color={completedCount >= weeklyGoal ? '#51CF66' : '#FFD43B'}>
              {Math.round((completedCount / weeklyGoal) * 100)}%
            </Typography>
          </Box>
        </CardContent>
      </Card>

      {/* 本周摘要 */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
        <Card sx={{ borderRadius: 3 }}>
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 }, textAlign: 'center' }}>
            <TimerIcon sx={{ fontSize: 28, color: '#5BCFC4', mb: 0.5 }} />
            <Typography variant="caption" color="text.secondary">总时长</Typography>
            <Typography variant="h6" fontWeight="bold">{totalDuration} 分钟</Typography>
          </CardContent>
        </Card>
        <Card sx={{ borderRadius: 3 }}>
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 }, textAlign: 'center' }}>
            <StraightenIcon sx={{ fontSize: 28, color: '#1E5DA8', mb: 0.5 }} />
            <Typography variant="caption" color="text.secondary">总距离</Typography>
            <Typography variant="h6" fontWeight="bold">{totalDistance.toFixed(1)} km</Typography>
          </CardContent>
        </Card>
        <Card sx={{ borderRadius: 3 }}>
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 }, textAlign: 'center' }}>
            <LocalFireDepartmentIcon sx={{ fontSize: 28, color: '#FF6B6B', mb: 0.5 }} />
            <Typography variant="caption" color="text.secondary">总消耗</Typography>
            <Typography variant="h6" fontWeight="bold">{totalCalories} kcal</Typography>
          </CardContent>
        </Card>
      </Box>

      {/* 运动类型分布 */}
      <Card sx={{ borderRadius: 3, mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 2 }}>运动类型分布</Typography>
          {distribution.map((item) => (
            <Box key={item.label} sx={{ mb: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2">{item.label}</Typography>
                <Typography variant="body2" fontWeight="medium">{item.value}%</Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={item.value}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: '#f0f0f0',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 4,
                    backgroundColor: item.color,
                  },
                }}
              />
            </Box>
          ))}
        </CardContent>
      </Card>

      {/* 记录列表 */}
      <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1.5 }}>运动记录</Typography>
      <Card sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <List disablePadding>
          {demoWorkouts.map((w, i) => (
            <Box key={w.id}>
              {i > 0 && <Divider />}
              <ListItem sx={{ px: 2 }}>
                <Avatar sx={{ width: 40, height: 40, bgcolor: `${w.color}15`, color: w.color, mr: 1.5 }}>
                  {w.icon}
                </Avatar>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label={w.typeLabel} size="small" sx={{ bgcolor: `${w.color}15`, color: w.color, fontWeight: 'bold', fontSize: 12, height: 24 }} />
                      <Typography variant="body2" fontWeight="medium">
                        {w.duration}分钟{w.distance ? ` · ${w.distance.toFixed(1)}km` : ''}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        · {w.calories} kcal
                      </Typography>
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      {w.date} · {w.note}
                    </Typography>
                  }
                />
              </ListItem>
            </Box>
          ))}
        </List>
      </Card>
    </Box>
  );
}
