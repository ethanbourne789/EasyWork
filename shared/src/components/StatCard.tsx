// shared/src/components/StatCard.tsx
import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  color?: string;
  subtitle?: string;
  trend?: { value: number; label: string };
}

export default function StatCard({ label, value, icon, color = '#1976d2', subtitle, trend }: StatCardProps) {
  return (
    <Card
      sx={{
        height: '100%',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 4,
        },
      }}
    >
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, '&:last': { pb: 3 } }}>
        {icon && (
          <Box
            sx={{
              fontSize: 40,
              color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" noWrap>
            {label}
          </Typography>
          <Typography variant="h4" fontWeight={800} sx={{ color, lineHeight: 1.2 }}>
            {value}
          </Typography>
          {(subtitle || trend) && (
            <Typography variant="caption" color="text.secondary">
              {subtitle ?? (trend && `${trend.value > 0 ? '+' : ''}${trend.value}% ${trend.label}`)}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
