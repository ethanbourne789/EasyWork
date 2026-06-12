import React, { useState } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Badge,
  Divider,
  Typography,
  Avatar,
  IconButton,
} from '@mui/material';
import {
  Inbox as InboxIcon,
  Send as SendIcon,
  Drafts as DraftsIcon,
  DeleteOutline as DeleteIcon,
  StarBorder as StarBorderIcon,
  Star as StarIcon,
  AccessTime as TimeIcon,
  Person as PersonIcon,
} from '@mui/icons-material';

interface MailItem {
  id: number;
  from: string;
  email: string;
  subject: string;
  preview: string;
  time: string;
  read: boolean;
  starred: boolean;
  body: string;
}

const demoMails: MailItem[] = [
  {
    id: 1, from: '张三', email: 'zhangsan@company.com',
    subject: '关于下周项目进度会议的安排', preview: '您好，下周一上午10点我们将召开项目进度会议，请各位提前准备好...',
    time: '09:30', read: false, starred: true,
    body: `<p>您好，</p><p>下周一（6月15日）上午10点我们将在3号会议室召开项目进度会议，请各位提前准备好各自负责模块的进展汇报。</p><p>议程如下：</p><ol><li>各模块进度汇报（每人5分钟）</li><li>风险问题讨论</li><li>下一阶段任务分配</li></ol><p>请准时参加。</p><p>此致<br/>张三</p>`,
  },
  {
    id: 2, from: '李四', email: 'lisi@partner.com',
    subject: '合作方案初稿已完成，请审阅', preview: '附件中是我们团队整理的合作方案初稿，涵盖了商务模式、技术架构...',
    time: '08:15', read: false, starred: false,
    body: `<p>Hi，</p><p>附件中是我们团队整理的合作方案初稿，主要包含以下内容：</p><ul><li>商务合作模式</li><li>技术架构设计</li><li>项目时间规划</li><li>资源投入评估</li></ul><p>请您抽空审阅，有问题随时沟通。</p><p>Best regards,<br/>李四</p>`,
  },
  {
    id: 3, from: '系统通知', email: 'noreply@system.com',
    subject: '您的账户安全提醒', preview: '检测到您的账号在新设备上登录，如非本人操作请及时修改密码...',
    time: '昨天', read: false, starred: false,
    body: `<p>尊敬的用户：</p><p>我们检测到您的账号于2026年6月9日 14:32在以下设备上登录：</p><p><strong>设备：</strong>Windows PC - Chrome浏览器<br/><strong>位置：</strong>上海市</p><p>如果这是您本人的操作，请忽略此邮件。如果不是，请立即修改密码并开启两步验证。</p>`,
  },
  {
    id: 4, from: '王五', email: 'wangwu@team.com',
    subject: 'Re: 前端组件库选型讨论', preview: '我同意使用 MUI 作为基础组件库，它的定制能力和社区支持都比较成熟...',
    time: '昨天', read: true, starred: true,
    body: `<p>各位好，</p><p>关于前端组件库的选型，我仔细对比了几个主流方案后，同意使用 <strong>MUI (Material UI)</strong> 作为基础组件库。理由如下：</p><ol><li>API 设计规范，学习成本低</li><li>主题定制能力强</li><li>社区活跃，文档完善</li><li>与企业现有技术栈兼容性好</li></ol><p>如有其他意见欢迎继续讨论。</p><p>王五</p>`,
  },
  {
    id: 5, from: '人力资源部', email: 'hr@company.com',
    subject: '2026年第二季度团建活动通知', preview: '为增强团队凝聚力，公司定于7月15日组织季度团建活动，地点为杭州西湖...',
    time: '06-08', read: true, starred: false,
    body: `<p>全体同事：</p><p>为增强团队凝聚力，促进跨部门交流，公司定于<strong>2026年7月15日（周六）</strong>组织第二季度团建活动。</p><p><strong>活动安排：</strong></p><ul><li>09:00 公司集合出发</li><li>11:00 抵达杭州西湖景区</li><li>12:00 团队午餐</li><li>14:00 户外拓展活动</li><li>18:00 返程</li></ul><p>请各部门统计参加人数，于6月20日前反馈至HR部门。</p>`,
  },
  {
    id: 6, from: '赵六', email: 'zhaoliu@dev.com',
    subject: '代码审查请求：feat/user-module', preview: '提交了用户模块的重构代码，主要改动包括权限校验逻辑优化和接口统一...',
    time: '06-07', read: true, starred: false,
    body: `<p>Hi Team，</p><p>我刚提交了用户模块的重构代码（分支：<code>feat/user-module</code>），主要改动包括：</p><ul><li>权限校验逻辑优化，统一使用 RBAC 模型</li><li>接口响应格式标准化</li><li>添加单元测试覆盖率从 45% 提升至 78%</li><li>修复了3个已知的安全漏洞</li></ul><p>麻烦各位帮忙做一下 Code Review，感谢！</p><p>赵六</p>`,
  },
  {
    id: 7, from: '财务部', email: 'finance@company.com',
    subject: '6月份报销截止提醒', preview: '请注意，6月份的费用报销申请将于6月25日截止，逾期将顺延至下月...',
    time: '06-05', read: true, starred: false,
    body: `<p>各位同事：</p><p>温馨提示：6月份的费用报销申请将于<strong>6月25日（周四）17:00</strong>截止。</p><p>注意事项：</p><ol><li>请确保发票信息完整、准确</li><li>差旅报销需附审批单</li><li>超过5000元的报销需部门总监审批</li></ol><p>如有疑问请联系财务部内线 8020。</p>`,
  },
  {
    id: 8, from: '孙七', email: 'sunqi@design.com',
    subject: '新版设计稿已上传 Figma', preview: '首页和详情页的设计稿已更新到 Figma 项目中，请查看并提出修改建议...',
    time: '06-04', read: true, starred: true,
    body: `<p>大家好，</p><p>新版设计稿已上传至 Figma 项目，本次更新涉及以下页面：</p><ul><li>首页改版（全新视觉风格）</li><li>详情页重构（信息层级优化）</li><li>个人中心页面新增</li></ul><p>Figma 链接：<a href="#">点击查看设计稿</a></p><p>请在周五前完成评审并反馈修改建议，谢谢！</p><p>孙七</p>`,
  },
  {
    id: 9, from: '周八', email: 'zhouba@ops.com',
    subject: '服务器维护公告：6月12日凌晨', preview: '为提升系统稳定性，计划于6月12日凌晨2:00-6:00进行服务器维护升级...',
    time: '06-03', read: true, starred: false,
    body: `<p>各位同事：</p><p>为提升系统稳定性和性能，运维团队计划进行服务器维护升级。</p><p><strong>维护时间：</strong>2026年6月12日（周五）02:00 - 06:00</p><p><strong>影响范围：</strong></p><ul><li>内部系统暂时不可用</li><li>邮件服务可能延迟</li><li>文件共享服务暂停</li></ul><p>请大家提前做好相关工作安排，给您带来的不便敬请谅解。</p><p>运维团队</p>`,
  },
];

interface FolderItem {
  name: string;
  icon: React.ReactElement;
  count?: number;
}

const folders: FolderItem[] = [
  { name: '收件箱', icon: <InboxIcon />, count: 12 },
  { name: '已发送', icon: <SendIcon /> },
  { name: '草稿箱', icon: <DraftsIcon />, count: 3 },
  { name: '垃圾箱', icon: <DeleteIcon /> },
];

export default function App() {
  const [selectedFolder, setSelectedFolder] = useState('收件箱');
  const [selectedMailId, setSelectedMailId] = useState<number | null>(1);
  const [mails, setMails] = useState(demoMails);

  const selectedMail = mails.find((m) => m.id === selectedMailId);

  const toggleStar = (id: number) => {
    setMails(mails.map((m) => (m.id === id ? { ...m, starred: !m.starred } : m)));
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#f5f5f5' }}>
      {/* 左栏 - 文件夹列表 */}
      <Box
        sx={{
          width: 180,
          borderRight: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ p: 2, pb: 1 }}>
          <Typography variant="h6" fontWeight={600}>
            📧 邮箱
          </Typography>
        </Box>
        <List dense>
          {folders.map((folder) => (
            <ListItem key={folder.name} disablePadding sx={{ px: 1 }}>
              <ListItemButton
                selected={selectedFolder === folder.name}
                onClick={() => setSelectedFolder(folder.name)}
                sx={{
                  borderRadius: 1.5,
                  mx: 0.5,
                  '&.Mui-selected': { bgcolor: 'primary.light', color: 'primary.contrastText', '& .MuiListItemIcon-root': { color: 'inherit' } },
                }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>{folder.icon}</ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{folder.name}</span>
                      {folder.count != null && (
                        <Badge
                          badgeContent={folder.count}
                          color="error"
                          sx={{
                            '.MuiBadge-badge': { fontSize: 11, height: 18, minWidth: 18, px: 0.5 },
                          }}
                        />
                      )}
                    </Box>
                  }
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        <Divider />
        <Box sx={{ p: 2, mt: 'auto' }}>
          <Typography variant="caption" color="text.secondary">
            共 {mails.length} 封邮件
          </Typography>
        </Box>
      </Box>

      {/* 中栏 - 邮件列表 */}
      <Box
        sx={{
          width: 320,
          borderRight: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle1" fontWeight={600}>
            {selectedFolder}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {mails.filter((m) => !m.read).length} 封未读
          </Typography>
        </Box>
        <List sx={{ flex: 1, overflowY: 'auto', px: 1, py: 0.5 }}>
          {mails.map((mail) => (
            <ListItem key={mail.id} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                selected={selectedMailId === mail.id}
                onClick={() => setSelectedMailId(mail.id)}
                sx={{
                  borderRadius: 1.5,
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  py: 1.5,
                  px: 1.5,
                  '&.Mui-selected': { bgcolor: 'action.selected' },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ width: 28, height: 28, fontSize: 13, bgcolor: `hsl(${mail.id * 37}, 60%, 50%)` }}>
                      {mail.from[0]}
                    </Avatar>
                    <Typography
                      variant="body2"
                      fontWeight={mail.read ? 400 : 700}
                      noWrap
                      sx={{ maxWidth: 120 }}
                    >
                      {mail.from}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleStar(mail.id); }} sx={{ p: 0.5 }}>
                    {mail.starred ? <StarIcon fontSize="inherit" color="warning" /> : <StarBorderIcon fontSize="inherit" color="disabled" />}
                  </IconButton>
                </Box>
                <Typography
                  variant="body2"
                  fontWeight={mail.read ? 400 : 600}
                  noWrap
                  sx={{ mb: 0.3, color: mail.read ? 'text.primary' : 'text.primary' }}
                >
                  {mail.subject}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    sx={{ flex: 1, mr: 1 }}
                  >
                    {mail.preview}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" whiteSpace="nowrap">
                    {mail.time}
                  </Typography>
                </Box>
                {!mail.read && (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 4,
                      height: 24,
                      borderRadius: 2,
                      bgcolor: 'primary.main',
                    }}
                  />
                )}
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>

      {/* 右栏 - 邮件阅读面板 */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedMail ? (
          <>
            <Box sx={{ p: 2.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
              <Typography variant="h6" gutterBottom>
                {selectedMail.subject}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: `hsl(${selectedMail.id * 37}, 60%, 50%)` }}>
                  {selectedMail.from[0]}
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PersonIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography variant="body2" fontWeight={600}>
                      {selectedMail.from}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      &lt;{selectedMail.email}&gt;
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.3 }}>
                    <TimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary">
                      收件人：我 &nbsp;|&nbsp; 时间：2026年6月10日 {selectedMail.time}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Box>
            <Box
              sx={{
                flex: 1,
                p: 3,
                overflowY: 'auto',
                bgcolor: '#fff',
                '& p': { mb: 1.2, lineHeight: 1.8, color: 'text.primary' },
                '& ul, & ol': { pl: 2.5, mb: 1.2 },
                '& li': { mb: 0.4, lineHeight: 1.7 },
                '& strong': { fontWeight: 700 },
              }}
              dangerouslySetInnerHTML={{ __html: selectedMail.body }}
            />
          </>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.paper' }}>
            <Typography color="text.secondary">选择一封邮件查看内容</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
