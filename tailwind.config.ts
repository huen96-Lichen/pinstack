import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'media',
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pinstack: {
          app: 'var(--ps-bg-app)',
          surface: 'var(--ps-bg-surface)',
          elevated: 'var(--ps-bg-elevated)',
          subtle: 'var(--ps-bg-subtle)',
          primaryText: 'var(--ps-text-primary)',
          secondaryText: 'var(--ps-text-secondary)',
          tertiaryText: 'var(--ps-text-tertiary)',
          borderSubtle: 'var(--ps-border-subtle)',
          borderDefault: 'var(--ps-border-default)',
          borderStrong: 'var(--ps-border-strong)',
          brand: 'var(--ps-brand-primary)',
          brandSoft: 'var(--ps-brand-soft)',
          success: 'var(--ps-status-success)',
          warning: 'var(--ps-status-warning)',
          danger: 'var(--ps-status-danger)',
          info: 'var(--ps-status-info)'
        }
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px'
      },
      fontSize: {
        xs: '12px',
        sm: '13px',
        base: '14px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
        '3xl': '32px'
      },
      boxShadow: {
        glass: '0 18px 34px rgba(13, 25, 37, 0.16)',
        pinstackXs: '0 1px 2px rgba(22, 22, 22, 0.04)',
        pinstackSm: '0 10px 24px rgba(22, 22, 22, 0.06)',
        pinstackMd: '0 20px 44px rgba(22, 22, 22, 0.08)',
        pinstackLg: '0 26px 54px rgba(22, 22, 22, 0.1)'
      },
      backdropBlur: {
        xs: '2px'
      }
    }
  },
  plugins: []
};

export default config;
