// shared/src/components/StatusPill.tsx
import Chip from '@mui/material/Chip';

interface StatusPillProps {
  label: string;
  color?: string;
  size?: 'small' | 'medium';
  variant?: 'filled' | 'outlined';
}

export default function StatusPill({ label, color, size = 'small', variant = 'filled' }: StatusPillProps) {
  return (
    <Chip
      label={label}
      size={size}
      variant={variant === 'outlined' ? 'outlined' : 'filled'}
      sx={
        color
          ? {
              bgcolor: variant === 'outlined' ? 'transparent' : `${color}20`,
              color,
              borderColor: color,
              fontWeight: 600,
              fontSize: '0.75rem',
            }
          : {}
      }
    />
  );
}
