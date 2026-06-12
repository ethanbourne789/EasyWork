// shared/src/components/PageScaffold.tsx
import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface PageScaffoldProps {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export default function PageScaffold({ title, icon, action, children }: PageScaffoldProps) {
  return (
    <Box sx={{ p: 3 }}>
      {/* 页面标题栏 */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {icon && <Box sx={{ color: 'primary.main' }}>{icon}</Box>}
          <Typography variant="h5" fontWeight={700}>
            {title}
          </Typography>
        </Box>
        {action}
      </Box>
      {/* 内容区 */}
      {children}
    </Box>
  );
}
