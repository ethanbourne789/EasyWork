import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TodayIcon from '@mui/icons-material/Today';
import ScheduleIcon from '@mui/icons-material/Schedule';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import DirectionsRunIcon from '@mui/icons-material/DirectionsRun';
import AddTaskIcon from '@mui/icons-material/AddTask';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';

const stats = [
  { label: '今日待办', value: '12', icon: <TodayIcon />, color: '#5BCFC4', trend: { value: 8, label: '较昨日' } },
  { label: '今日日程', value: '5', icon: <ScheduleIcon />, color: '#1E5DA8', trend: { value: -2, label: '较昨日' } },
  { label: '消费金额', value: '\u00A5128.50', icon: <ShoppingCartIcon />, color: '#FF6B6B' },
  { label: '运动步数', value: '8,432', icon: <DirectionsRunIcon />, color: '#51CF66', trend: { value: 15, label: '较昨日' } },
];

const quickActions = [
  { label: '快速添加任务', icon: <AddTaskIcon />, color: '#5BCFC4' },
  { label: '记录笔记', icon: <NoteAddIcon />, color: '#1E5DA8' },
  { label: '快速记账', icon: <ReceiptLongIcon />, color: '#FF6B6B' },
  { label: '运动记录', icon: <FitnessCenterIcon />, color: '#51CF66' },
];

const stockData = [
  { name: '\u4E0D\u82F1\u8FBE\u7279', code: '300750', price: 256.30, changePercent: 2.35, volume: '12.8\u4EBF' },
  { name: '\u8D85\u7EF4\u5927\u697C', code: '300496', price: 78.45, changePercent: -1.22, volume: '5.3\u4EBF' },
  { name: '\u5B81\u738B\u80A1\u4EFD', code: '002304', price: 198.60, changePercent: 0.85, volume: '8.9\u4EBF' },
  { name: '\u4E2D\u56FD\u4E2D\u5141', code: '600019', price: 6.72, changePercent: -0.44, volume: '23.1\u4EBF' },
  { name: '\u8305\u53F0', code: '600519', price: 1685.00, changePercent: 1.56, volume: '3.2\u4EBF' },
  { name: '\u6BD4\u4E9A\u8FEA', code: '002594', price: 245.80, changePercent: -0.78, volume: '15.6\u4EBF' },
];

function StatCard({ label, value, icon, color, trend }: {
  label: string; value: string; icon: React.ReactNode; color: string;
  trend?: { value: number; label: string };
}) {
  return (
    <Card sx={{ height: '100%', borderRadius: 3, transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 } }}>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, '&:last': { pb: 3 } }}>
        <Avatar sx={{ width: 52, height: 52, bgcolor: color + '15', color }}>{icon}</Avatar>
        <Box>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
          <Typography variant="h4" fontWeight={800} sx={{ color, lineHeight: 1.2 }}>{value}</Typography>
          {trend && (
            <Typography variant="caption" sx={{ color: trend.value >= 0 ? '#51CF66' : '#FF6B6B', fontWeight: 600 }}>
              {trend.value > 0 ? '+' : ''}{trend.value}% {trend.label}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

export default function App() {
  return (
    <Box sx={{ p: 3 }}>
      {/* 页面标题 */}
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        数据总览
      </Typography>

      {/* 统计卡片 */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {stats.map((stat) => (
          <Grid item xs={12} sm={6} lg={3} key={stat.label}>
            <StatCard {...stat} />
          </Grid>
        ))}
      </Grid>

      {/* 快捷操作 + 股票概览 */}
      <Grid container spacing={3}>
        {/* 快捷操作 */}
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>快捷操作</Typography>
              <Grid container spacing={1.5}>
                {quickActions.map((action) => (
                  <Grid item xs={6} key={action.label}>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={<Avatar sx={{ width: 28, height: 28, bgcolor: action.color + '20', color: action.color, fontSize: 16 }}>{action.icon}</Avatar>}
                      sx={{
                        justifyContent: 'flex-start',
                        py: 1.5,
                        textTransform: 'none',
                        borderColor: 'divider',
                        borderRadius: 2,
                        '&:hover': { borderColor: action.color, bgcolor: action.color + '08' },
                      }}
                    >
                      {action.label}
                    </Button>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* 自选股行情 */}
        <Grid item xs={12} md={8}>
          <Card sx={{ borderRadius: 3, height: '100%' }}>
            <CardContent sx={{ '&:last': { pb: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="subtitle1" fontWeight={600}>自选股行情</Typography>
                <Typography variant="caption" color="text.secondary">数据仅供参考，不构成投资建议</Typography>
              </Box>
              <Divider sx={{ mb: 1 }} />
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>名称/代码</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>最新价</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>涨跌幅</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>成交额</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {stockData.map((stock) => (
                      <TableRow key={stock.code} hover sx={{ '&:last-child td': { border: 0 } }}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{stock.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{stock.code}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700}>{stock.price.toFixed(2)}</Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                            {stock.changePercent >= 0
                              ? <TrendingUpIcon sx={{ fontSize: 16, color: '#FF6B6B' }} />
                              : <TrendingDownIcon sx={{ fontSize: 16, color: '#51CF66' }} />
                            }
                            <Typography
                              component="span"
                              variant="body2"
                              sx={{ color: stock.changePercent >= 0 ? '#FF6B6B' : '#51CF66', fontWeight: 700 }}
                            >
                              {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color="text.secondary">{stock.volume}</Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
