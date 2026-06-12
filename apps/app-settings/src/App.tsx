import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import SettingsIcon from '@mui/icons-material/Settings';
import PaletteIcon from '@mui/icons-material/Palette';
import NotificationsIcon from '@mui/icons-material/Notifications';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import StorageIcon from '@mui/icons-material/Storage';
import InfoIcon from '@mui/icons-material/Info';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import BackupIcon from '@mui/icons-material/Backup';
import RestoreIcon from '@mui/icons-material/Restore';
import UpdateIcon from '@mui/icons-material/Update';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import ComputerIcon from '@mui/icons-material/Computer';

const GRADIENT = 'linear-gradient(135deg, #5BCFC4 0%, #1E5DA8 100%)';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { id: 'appearance', label: '外观', icon: <PaletteIcon /> },
  { id: 'notifications', label: '通知', icon: <NotificationsIcon /> },
  { id: 'accounts', label: '账号管理', icon: <AccountCircleIcon /> },
  { id: 'data', label: '数据管理', icon: <StorageIcon /> },
  { id: 'about', label: '关于', icon: <InfoIcon /> },
  { id: 'startup', label: '启动行为', icon: <RocketLaunchIcon /> },
];

const mockAccounts = [
  { email: 'zhangsan@example.com', name: '张三', primary: true },
  { email: 'lisi@company.cn', name: '李四', primary: false },
  { email: 'work@team.io', name: '工作邮箱', primary: false },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('appearance');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [language, setLanguage] = useState('zh-CN');
  const [emailNotif, setEmailNotif] = useState(true);
  const [taskReminder, setTaskReminder] = useState(true);
  const [stockAlert, setStockAlert] = useState(false);
  const [minToTray, setMinToTray] = useState(true);
  const [closeMinimize, setCloseMinimize] = useState(false);

  const renderPanel = () => {
    switch (activeTab) {
      case 'appearance':
        return (
          <Box>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>外观</Typography>

            <Card sx={{ borderRadius: 3, mb: 2 }}>
              <CardContent>
                <FormControl component="fieldset">
                  <FormLabel component="legend" sx={{ mb: 1, fontSize: 14, fontWeight: 600 }}>主题模式</FormLabel>
                  <RadioGroup value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
                    <FormControlLabel
                      value="light"
                      control={<Radio size="small" />}
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LightModeIcon sx={{ fontSize: 18 }} />
                          <Typography variant="body2">亮色</Typography>
                        </Box>
                      }
                    />
                    <FormControlLabel
                      value="dark"
                      control={<Radio size="small" />}
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <DarkModeIcon sx={{ fontSize: 18 }} />
                          <Typography variant="body2">暗色</Typography>
                        </Box>
                      }
                    />
                    <FormControlLabel
                      value="system"
                      control={<Radio size="small" />}
                      label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <ComputerIcon sx={{ fontSize: 18 }} />
                          <Typography variant="body2">跟随系统</Typography>
                        </Box>
                      }
                    />
                  </RadioGroup>
                </FormControl>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>语言</Typography>
                <Select
                  size="small"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="zh-CN">简体中文</MenuItem>
                  <MenuItem value="zh-TW">繁體中文</MenuItem>
                  <MenuItem value="en-US">English</MenuItem>
                </Select>
              </CardContent>
            </Card>
          </Box>
        );

      case 'notifications':
        return (
          <Box>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>通知</Typography>
            <Card sx={{ borderRadius: 3 }}>
              <List disablePadding>
                <ListItem sx={{ px: 3 }}>
                  <ListItemText
                    primary="邮件通知"
                    secondary="收到新邮件时发送桌面通知"
                  />
                  <Switch size="small" checked={emailNotif} onChange={(e) => setEmailNotif(e.target.checked)} />
                </ListItem>
                <Divider variant="inset" component="li" />
                <ListItem sx={{ px: 3 }}>
                  <ListItemText
                    primary="任务提醒"
                    secondary="任务截止前发送提醒通知"
                  />
                  <Switch size="small" checked={taskReminder} onChange={(e) => setTaskReminder(e.target.checked)} />
                </ListItem>
                <Divider variant="inset" component="li" />
                <ListItem sx={{ px: 3 }}>
                  <ListItemText
                    primary="股票预警"
                    secondary="股票价格达到设定阈值时提醒"
                  />
                  <Switch size="small" checked={stockAlert} onChange={(e) => setStockAlert(e.target.checked)} />
                </ListItem>
              </List>
            </Card>
          </Box>
        );

      case 'accounts':
        return (
          <Box>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>账号管理</Typography>
            {mockAccounts.map((account, i) => (
              <Card key={account.email} sx={{ borderRadius: 3, mb: i < mockAccounts.length - 1 ? 1.5 : 0 }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Avatar sx={{
                    width: 44,
                    height: 44,
                    bgcolor: GRADIENT,
                    fontSize: 16,
                    fontWeight: 'bold',
                  }}>
                    {account.name[0]}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight="bold">{account.name}</Typography>
                      {account.primary && (
                        <Typography
                          variant="caption"
                          sx={{
                            bgcolor: GRADIENT,
                            color: '#fff',
                            px: 0.75,
                            py: 0.125,
                            borderRadius: 1,
                            fontSize: 10,
                            fontWeight: 'bold',
                          }}
                        >
                          主账号
                        </Typography>
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {account.email}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <IconButton size="small" color="primary"><EditIcon sx={{ fontSize: 18 }} /></IconButton>
                    {!account.primary && (
                      <IconButton size="small" color="error"><DeleteIcon sx={{ fontSize: 18 }} /></IconButton>
                    )}
                  </Box>
                </CardContent>
              </Card>
            ))}
            <Button
              fullWidth
              variant="outlined"
              startIcon={<AccountCircleIcon />}
              sx={{ mt: 2, textTransform: 'none', borderRadius: 2 }}
            >
              添加新账号
            </Button>
          </Box>
        );

      case 'data':
        return (
          <Box>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>数据管理</Typography>
            <Card sx={{ borderRadius: 3, mb: 2 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>存储位置</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, bgcolor: '#f5f5f5', borderRadius: 2 }}>
                  <StorageIcon sx={{ color: '#999', fontSize: 20 }} />
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }} noWrap>
                    C:\Users\User\AppData\Roaming\EasyWork\data\
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  当前占用空间：约 128 MB
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ borderRadius: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  <Button
                    variant="contained"
                    startIcon={<BackupIcon />}
                    sx={{ textTransform: 'none', borderRadius: 2, background: GRADIENT }}
                  >
                    备份数据
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<RestoreIcon />}
                    sx={{ textTransform: 'none', borderRadius: 2 }}
                  >
                    恢复数据
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                  上次备份时间：2025-06-09 22:30:15
                </Typography>
              </CardContent>
            </Card>
          </Box>
        );

      case 'about':
        return (
          <Box>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>关于</Typography>
            <Card sx={{ borderRadius: 3, mb: 2, textAlign: 'center' }}>
              <CardContent sx={{ py: 4 }}>
                <Avatar sx={{
                  width: 72,
                  height: 72,
                  mx: 'auto',
                  mb: 2,
                  background: GRADIENT,
                  fontSize: 32,
                  fontWeight: 'bold',
                }}>
                  EW
                </Avatar>
                <Typography variant="h6" fontWeight="bold">EasyWork</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  高效工作助手
                </Typography>
                <Box sx={{ mt: 2, display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 2, py: 0.5, bgcolor: '#f0f0f0', borderRadius: 2 }}>
                  <Typography variant="body2" fontWeight="medium">版本 v1.0.0</Typography>
                </Box>
              </CardContent>
            </Card>
            <Card sx={{ borderRadius: 3, mb: 2 }}>
              <List disablePadding>
                <ListItem sx={{ px: 3 }}>
                  <ListItemText
                    primary="检查更新"
                    secondary="当前已是最新版本"
                  />
                  <Button size="small" startIcon={<UpdateIcon />} variant="outlined" sx={{ textTransform: 'none', borderRadius: 2 }}>
                    检查
                  </Button>
                </ListItem>
              </List>
            </Card>
            <Card sx={{ borderRadius: 3 }}>
              <CardContent>
                <Typography variant="subtitle2" fontWeight="bold">开源信息</Typography>
                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Typography variant="body2" component="a" href="#" sx={{ color: '#1E5DA8', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                    开源许可证 (MIT)
                  </Typography>
                  <Typography variant="body2" component="a" href="#" sx={{ color: '#1E5DA8', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                    第三方依赖许可
                  </Typography>
                  <Typography variant="body2" component="a" href="#" sx={{ color: '#1E5DA8', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                    GitHub 仓库
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Box>
        );

      case 'startup':
        return (
          <Box>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>启动行为</Typography>
            <Card sx={{ borderRadius: 3 }}>
              <List disablePadding>
                <ListItem sx={{ px: 3 }}>
                  <ListItemText
                    primary="启动时最小化到托盘"
                    secondary="应用启动后自动隐藏到系统托盘，不显示主窗口"
                  />
                  <Switch size="small" checked={minToTray} onChange={(e) => setMinToTray(e.target.checked)} />
                </ListItem>
                <Divider variant="inset" component="li" />
                <ListItem sx={{ px: 3 }}>
                  <ListItemText
                    primary="关闭时最小化而非退出"
                    secondary="点击关闭按钮时仅最小化到托盘，不退出程序"
                  />
                  <Switch size="small" checked={closeMinimize} onChange={(e) => setCloseMinimize(e.target.checked)} />
                </ListItem>
              </List>
            </Card>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100%' }}>
      {/* 左栏导航 */}
      <Box
        sx={{
          width: 220,
          borderRight: '1px solid rgba(0,0,0,0.08)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 标题 */}
        <Box sx={{ p: 2, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsIcon sx={{ fontSize: 24, color: '#1E5DA8' }} />
          <Typography variant="h6" fontWeight="bold" sx={{ background: GRADIENT, backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            设置
          </Typography>
        </Box>

        <Divider />

        <List sx={{ px: 1, py: 0.5, flex: 1 }}>
          {navItems.map((item) => (
            <ListItem key={item.id} disablePadding sx={{ mb: 0.25 }}>
              <ListItemButton
                selected={activeTab === item.id}
                onClick={() => setActiveTab(item.id)}
                sx={{
                  borderRadius: 2,
                  py: 0.85,
                  px: 1.5,
                  '&.Mui-selected': {
                    bgcolor: 'rgba(94,207,196,0.1)',
                    color: '#1E5DA8',
                    '& .MuiListItemIcon-root': { color: '#1E5DA8' },
                    '&:hover': { bgcolor: 'rgba(94,207,196,0.15)' },
                  },
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.03)' },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ fontSize: 13.5, fontWeight: activeTab === item.id ? 600 : 400 }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>

      {/* 右栏面板 */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
        {renderPanel()}
      </Box>
    </Box>
  );
}
