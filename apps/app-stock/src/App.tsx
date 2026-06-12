import { useState } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  ButtonGroup,
  Button,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  StarBorder as StarBorderIcon,
  Star as StarIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';

interface StockItem {
  code: string;
  name: string;
  price: number;
  changePercent: number;
  changeAmount: number;
  volume: string; // 成交额（亿）
  high: number;
  low: number;
  open: number;
}

const demoStocks: StockItem[] = [
  { code: '600519', name: '贵州茅台', price: 1685.50, changePercent: 2.35, changeAmount: 38.60, volume: '45.2', high: 1702.00, low: 1645.20, open: 1650.90 },
  { code: '000858', name: '五粮液', price: 148.32, changePercent: -1.28, changeAmount: -1.93, volume: '18.7', high: 151.50, low: 147.10, open: 150.25 },
  { code: '300750', name: '宁德时代', price: 218.45, changePercent: 3.56, changeAmount: 7.52, volume: '62.3', high: 222.80, low: 210.30, open: 211.93 },
  { code: '601318', name: '中国平安', price: 48.76, changePercent: -0.82, changeAmount: -0.40, volume: '22.1', high: 49.52, low: 48.40, open: 49.16 },
  { code: '600036', name: '招商银行', price: 36.85, changePercent: 1.15, changeAmount: 0.42, volume: '15.8', high: 37.20, low: 36.40, open: 36.43 },
  { code: '002475', name: '立讯精密', price: 32.18, changePercent: -2.45, changeAmount: -0.81, volume: '28.9', high: 33.25, low: 31.90, open: 32.99 },
  { code: '600900', name: '长江电力', price: 28.94, changePercent: 0.52, changeAmount: 0.15, volume: '12.4', high: 29.18, low: 28.70, open: 28.79 },
];

const periods = ['日K', '周K', '月K'] as const;
type Period = (typeof periods)[number];

export default function App() {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('日K');
  const [starredCodes, setStarredCodes] = useState<Set<string>>(new Set(['600519', '300750']));

  const toggleStar = (code: string) => {
    setStarredCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#f5f5f5' }}>
      {/* 头部 */}
      <Box sx={{ px: 3, py: 2, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" fontWeight={600}>
            📈 自选股
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title="添加自选股" arrow>
              <IconButton size="small" color="primary" sx={{ border: '1px solid', borderColor: 'divider' }}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="刷新数据" arrow>
              <IconButton size="small" color="default">
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      {/* K线图占位区 */}
      <Box
        sx={{
          mx: 3,
          mt: 2,
          height: 340,
          borderRadius: 3,
          background: 'linear-gradient(135deg, #e0e0e0 0%, #bdbdbd 50%, #9e9e9e 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* 装饰性网格线 */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            opacity: 0.08,
            backgroundImage: `
              linear-gradient(rgba(0,0,0,0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,0,0,0.3) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />
        {/* 模拟K线柱 */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 60,
            left: '10%',
            right: '10%',
            height: 140,
            display: 'flex',
            alignItems: 'flex-end',
            gap: { xs: 3, sm: 5, md: 7 },
            opacity: 0.25,
          }}
        >
          {[65, 42, 78, 55, 88, 48, 72, 95, 60, 83, 70, 92, 58, 85, 68].map((h, i) => (
            <Box
              key={i}
              sx={{
                width: 12,
                height: `${h}%`,
                borderRadius: 1,
                bgcolor: i % 3 === 0 ? '#ef5350' : i % 3 === 1 ? '#26a69a' : '#ef5350',
                position: 'relative',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 1.5,
                  height: `${Math.random() * 40 + 20}%`,
                  bottom: `${h}%`,
                  bgcolor: 'inherit',
                },
              }}
            />
          ))}
        </Box>

        <Typography variant="h5" fontWeight={700} color="text.secondary" sx={{ zIndex: 1, mb: 1 }}>
          K线图（开发中）
        </Typography>
        <Typography variant="body2" color="text.disabled" sx={{ zIndex: 1, mb: 0.5 }}>
          支持日K / 周K / 月K 切换，MA / MACD / KDJ 技术指标
        </Typography>
        <Chip label="即将上线" size="small" color="primary" variant="outlined" sx={{ zIndex: 1 }} />
      </Box>

      {/* 时间周期工具栏 */}
      <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ButtonGroup variant="outlined" size="small" sx={{ '& .MuiButtonGroup-grouped': { px: 2.5 } }}>
          {periods.map((period) => (
            <Button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              variant={selectedPeriod === period ? 'contained' : 'outlined'}
              color={selectedPeriod === period ? 'primary' : 'inherit'}
              sx={{
                minWidth: 64,
                fontWeight: selectedPeriod === period ? 600 : 400,
              }}
            >
              {period}
            </Button>
          ))}
        </ButtonGroup>
        <Box sx={{ ml: 3, display: 'flex', gap: 1 }}>
          {['MA', 'MACD', 'KDJ'].map((indicator) => (
            <Chip key={indicator} label={indicator} size="small" variant="outlined" clickable sx={{ fontSize: 12 }} />
          ))}
        </Box>
      </Box>

      {/* 自选股列表表格 */}
      <Box sx={{ flex: 1, px: 3, pb: 3, overflow: 'hidden' }}>
        <TableContainer component={Paper} elevation={0} sx={{ height: '100%', borderRadius: 3 }}>
          <Table stickyHeader size="small" sx={{ '& .MuiTableCell-head': { bgcolor: 'grey.100', fontWeight: 600 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 50, textAlign: 'center' }}>关注</TableCell>
                <TableCell sx={{ width: 90 }}>代码</TableCell>
                <TableCell>名称</TableCell>
                <TableCell align="right" sx={{ width: 110 }}>最新价</TableCell>
                <TableCell align="right" sx={{ width: 100 }}>涨跌幅</TableCell>
                <TableCell align="right" sx={{ width: 110 }}>涨跌额</TableCell>
                <TableCell align="right" sx={{ width: 100 }}>成交额(亿)</TableCell>
                <TableCell align="right" sx={{ width: 100 }}>今开</TableCell>
                <TableCell align="right" sx={{ width: 100 }}>最高</TableCell>
                <TableCell align="right" sx={{ width: 100 }}>最低</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {demoStocks.map((stock) => {
                const isUp = stock.changePercent >= 0;
                const isStarred = starredCodes.has(stock.code);
                return (
                  <TableRow
                    key={stock.code}
                    hover
                    sx={{
                      cursor: 'pointer',
                      transition: 'bgcolor 0.15s',
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        onClick={() => toggleStar(stock.code)}
                        sx={{ p: 0.5 }}
                      >
                        {isStarred ? (
                          <StarIcon fontSize="small" color="warning" />
                        ) : (
                          <StarBorderIcon fontSize="small" color="disabled" />
                        )}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace" fontWeight={500}>
                        {stock.code}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {stock.name}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight={600} fontFamily="monospace">
                        {stock.price.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        {isUp ? (
                          <TrendingUpIcon sx={{ fontSize: 16, color: '#ef5350' }} />
                        ) : (
                          <TrendingDownIcon sx={{ fontSize: 16, color: '#26a69a' }} />
                        )}
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          fontFamily="monospace"
                          sx={{ color: isUp ? '#ef5350' : '#26a69a' }}
                        >
                          {isUp ? '+' : ''}{stock.changePercent.toFixed(2)}%
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        fontFamily="monospace"
                        fontWeight={500}
                        sx={{ color: isUp ? '#ef5350' : '#26a69a' }}
                      >
                        {isUp ? '+' : ''}{stock.changeAmount.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary" fontFamily="monospace">
                        {stock.volume}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary" fontFamily="monospace">
                        {stock.open.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="error" fontFamily="monospace">
                        {stock.high.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="success.main" fontFamily="monospace" sx={{ color: '#26a69a' }}>
                        {stock.low.toFixed(2)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* 底部状态栏 */}
      <Box
        sx={{
          px: 3,
          py: 1,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          共 {demoStocks.length} 只自选股 &nbsp;|&nbsp; 更新时间：2026-06-10 09:35:00
        </Typography>
        <Typography variant="caption" color="text.disabled">
          数据仅供参考，不构成投资建议
        </Typography>
      </Box>
    </Box>
  );
}
