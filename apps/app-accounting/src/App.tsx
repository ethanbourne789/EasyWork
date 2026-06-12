import { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Fab from '@mui/material/Fab';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AddIcon from '@mui/icons-material/Add';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import WorkIcon from '@mui/icons-material/Work';
import LocalCafeIcon from '@mui/icons-material/LocalCafe';
import MovieIcon from '@mui/icons-material/Movie';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import HomeIcon from '@mui/icons-material/Home';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import BookIcon from '@mui/icons-material/Book';
import FlightTakeoffIcon from '@mui/icons-material/FlightTakeoff';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';

const GRADIENT = 'linear-gradient(135deg, #5BCFC4 0%, #1E5DA8 100%)';

interface Transaction {
  id: number;
  date: string;
  time: string;
  category: string;
  icon: React.ReactNode;
  amount: number;
  type: 'income' | 'expense';
  note: string;
}

const demoTransactions: Transaction[] = [
  { id: 1, date: '2025-06-10', time: '09:15', category: '工资', icon: <WorkIcon />, amount: 15800, type: 'income', note: '6月工资' },
  { id: 2, date: '2025-06-10', time: '12:30', category: '餐饮', icon: <RestaurantIcon />, amount: 35.5, type: 'expense', note: '午餐 - 楼下快餐' },
  { id: 3, date: '2025-06-10', time: '18:45', category: '交通', icon: <DirectionsCarIcon />, amount: 25, type: 'expense', note: '打车回家' },
  { id: 4, date: '2025-06-09', time: '08:20', category: '餐饮', icon: <LocalCafeIcon />, amount: 18, type: 'expense', note: '早餐咖啡+面包' },
  { id: 5, date: '2025-06-09', time: '12:00', category: '餐饮', icon: <RestaurantIcon />, amount: 42, type: 'expense', note: '午餐 - 公司食堂' },
  { id: 6, date: '2025-06-09', time: '19:30', category: '购物', icon: <ShoppingCartIcon />, amount: 299, type: 'expense', note: '日用品采购' },
  { id: 7, date: '2025-06-09', time: '21:00', category: '娱乐', icon: <MovieIcon />, amount: 68, type: 'expense', note: '电影票 x2' },
  { id: 8, date: '2025-06-08', time: '10:00', category: '购物', icon: <PhoneAndroidIcon />, amount: 1299, type: 'expense', note: '手机壳+充电器' },
  { id: 9, date: '2025-06-08', time: '14:30', category: '餐饮', icon: <RestaurantIcon />, amount: 156, type: 'expense', note: '聚餐 - 同事生日' },
  { id: 10, date: '2025-06-08', time: '20:00', category: '娱乐', icon: <SportsEsportsIcon />, amount: 200, type: 'expense', note: '游戏充值' },
  { id: 11, date: '2025-06-07', time: '09:00', category: '交通', icon: <DirectionsCarIcon />, amount: 45, type: 'expense', note: '地铁充值' },
  { id: 12, date: '2025-06-07', time: '11:30', category: '购物', icon: <ShoppingCartIcon />, amount: 89, type: 'expense', note: '水果零食' },
  { id: 13, date: '2025-06-07', time: '16:00', category: '医疗', icon: <MedicalServicesIcon />, amount: 280, type: 'expense', note: '体检费用' },
  { id: 14, date: '2025-06-06', time: '08:30', category: '餐饮', icon: <LocalCafeIcon />, amount: 22, type: 'expense', note: '早餐' },
  { id: 15, date: '2025-06-06', time: '13:00', category: '餐饮', icon: <RestaurantIcon />, amount: 38, type: 'expense', note: '午餐外卖' },
  { id: 16, date: '2025-06-06', time: '18:00', category: '交通', icon: <DirectionsCarIcon />, amount: 30, type: 'expense', note: '共享单车月卡' },
  { id: 17, date: '2025-06-05', time: '10:00', category: '购物', icon: <BookIcon />, amount: 59, type: 'expense', note: '技术书籍' },
  { id: 18, date: '2025-06-05', time: '15:00', category: '住房', icon: <HomeIcon />, amount: 3500, type: 'expense', note: '房租' },
  { id: 19, date: '2025-06-04', time: '20:00', category: '旅行', icon: <FlightTakeoffIcon />, amount: 1200, type: 'expense', note: '机票预订' },
];

function groupByDate(transactions: Transaction[]): Record<string, Transaction[]> {
  return transactions.reduce((groups, t) => {
    (groups[t.date] ??= []).push(t);
    return groups;
  }, {} as Record<string, Transaction[]>);
}

export default function App() {
  const [fabOpen, setFabOpen] = useState(false);

  const monthlyIncome = 15800;
  const monthlyExpense = 6234.5;
  const balance = monthlyIncome - monthlyExpense;
  const budgetTotal = 10000;
  const budgetUsed = (monthlyExpense / budgetTotal) * 100;

  const grouped = groupByDate(demoTransactions);
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <Box sx={{ p: 3, pb: 10, maxWidth: 900, mx: 'auto' }}>
      {/* 标题 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <AccountBalanceWalletIcon sx={{ fontSize: 32, color: '#1E5DA8' }} />
        <Typography variant="h5" fontWeight="bold" sx={{ background: GRADIENT, backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          记账
        </Typography>
      </Box>

      {/* 概览卡片 */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
        <Card sx={{ borderRadius: 3, borderLeft: '4px solid #51CF66' }}>
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TrendingUpIcon sx={{ fontSize: 16, color: '#51CF66' }} /> 本月收入
            </Typography>
            <Typography variant="h5" fontWeight="bold" color="#51CF66" sx={{ mt: 0.5 }}>
              ¥{monthlyIncome.toLocaleString()}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ borderRadius: 3, borderLeft: '4px solid #FF6B6B' }}>
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <TrendingDownIcon sx={{ fontSize: 16, color: '#FF6B6B' }} /> 本月支出
            </Typography>
            <Typography variant="h5" fontWeight="bold" color="#FF6B6B" sx={{ mt: 0.5 }}>
              ¥{monthlyExpense.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ borderRadius: 3, borderLeft: '4px solid #1E5DA8' }}>
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AccountBalanceIcon sx={{ fontSize: 16, color: '#1E5DA8' }} /> 结余
            </Typography>
            <Typography variant="h5" fontWeight="bold" color="#1E5DA8" sx={{ mt: 0.5 }}>
              ¥{balance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* 预算进度 */}
      <Card sx={{ borderRadius: 3, mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2" fontWeight="bold">本月预算</Typography>
            <Typography variant="body2" color="text.secondary">
              ¥{monthlyExpense.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} / ¥{budgetTotal.toLocaleString()}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={Math.min(budgetUsed, 100)}
            sx={{
              height: 10,
              borderRadius: 5,
              backgroundColor: '#e0e0e0',
              '& .MuiLinearProgress-bar': {
                borderRadius: 5,
                background: budgetUsed > 80 ? '#FF6B6B' : budgetUsed > 60 ? '#FFD43B' : GRADIENT,
              },
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            已使用 {budgetUsed.toFixed(1)}% · 剩余 ¥{(budgetTotal - monthlyExpense).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
          </Typography>
        </CardContent>
      </Card>

      {/* 流水列表 */}
      <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1.5 }}>流水明细</Typography>
      <Card sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <List disablePadding>
          {dates.map((date, di) => (
            <Box key={date}>
              {di > 0 && <Divider />}
              <ListItem sx={{ bgcolor: '#f8f9fa', py: 0.75, px: 2 }}>
                <Typography variant="subtitle2" fontWeight="bold">{date}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  ({(grouped[date] ?? []).length} 笔)
                </Typography>
              </ListItem>
              {(grouped[date] ?? []).map((t) => (
                <Box key={t.id}>
                  <Divider variant="inset" component="li" />
                  <ListItem sx={{ px: 2 }}>
                    <ListItemAvatar>
                      <Avatar sx={{
                        width: 36, height: 36,
                        bgcolor: t.type === 'income' ? 'rgba(81,207,102,0.12)' : 'rgba(255,107,107,0.12)',
                        color: t.type === 'income' ? '#51CF66' : '#FF6B6B',
                      }}>
                        {t.icon}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" fontWeight="medium">{t.category}</Typography>
                          <Typography
                            variant="body2"
                            fontWeight="bold"
                            color={t.type === 'income' ? '#51CF66' : '#FF6B6B'}
                          >
                            {t.type === 'income' ? '+' : '-'}¥{t.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {t.note} · {t.time}
                        </Typography>
                      }
                    />
                  </ListItem>
                </Box>
              ))}
            </Box>
          ))}
        </List>
      </Card>

      {/* FAB */}
      <Fab
        color="primary"
        aria-label="记账"
        sx={{
          position: 'fixed',
          bottom: 32,
          right: 32,
          background: GRADIENT,
          '&:hover': { background: GRADIENT },
          zIndex: 1200,
        }}
        onClick={() => setFabOpen(!fabOpen)}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
}
