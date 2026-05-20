/* [UI-Designer] ID: WEBUI-TWCONFIG-001 | Date: 2026-05-20 | Description: Tailwind CDN 配置桥接 tokens.css 中的 CSS 变量，禁止使用任何令牌之外的颜色/字号/间距 */

window.tailwind = window.tailwind || {};
window.tailwind.config = {
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#FFFFFF',
      black: '#000000',
      primary:   'var(--color-primary)',
      secondary: 'var(--color-secondary)',
      success:   'var(--color-success)',
      warning:   'var(--color-warning)',
      error:     'var(--color-error)',
      n50:  'var(--color-neutral-50)',
      n100: 'var(--color-neutral-100)',
      n200: 'var(--color-neutral-200)',
      n300: 'var(--color-neutral-300)',
      n400: 'var(--color-neutral-400)',
      n500: 'var(--color-neutral-500)',
      n900: 'var(--color-neutral-900)',
      canvas: 'var(--bg-canvas)',
      panel:  'var(--bg-panel)',
      hover:  'var(--bg-hover)',
      sel:    'var(--bg-selected)',
      line:   'var(--border-default)',
      'success-bg': 'var(--tint-success-bg)',
      'warning-bg': 'var(--tint-warning-bg)',
      'error-bg':   'var(--tint-error-bg)',
      'info-bg':    'var(--tint-info-bg)'
    },
    spacing: {
      0: '0',
      px: '1px',
      1: '4px',
      2: '8px',
      3: '12px',
      4: '16px',
      6: '24px',
      8: '32px',
      12: '48px',
      16: '64px',
      nav: '64px',
      filter: '192px',
      list: '320px',
      'list-wide': '384px',
      full: '100%',
      auto: 'auto'
    },
    fontSize: {
      xs:   ['12px', { lineHeight: '1.5' }],
      sm:   ['14px', { lineHeight: '1.5' }],
      base: ['16px', { lineHeight: '1.25' }],
      lg:   ['20px', { lineHeight: '1.25' }],
      xl:   ['24px', { lineHeight: '1.25' }],
      '2xl':['32px', { lineHeight: '1.25' }]
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600'
    },
    borderRadius: {
      none: '0',
      sm: '4px',
      DEFAULT: '6px',
      md: '8px',
      lg: '8px',
      full: '9999px'
    },
    boxShadow: {
      none: 'none',
      sm: 'var(--shadow-1)',
      md: 'var(--shadow-2)'
    },
    maxWidth: {
      0: '0',
      list: '320px',
      'list-wide': '384px',
      prose: '672px',
      full: '100%',
      none: 'none'
    },
    maxHeight: {
      0: '0',
      list: '320px',
      'list-wide': '384px',
      full: '100%',
      none: 'none'
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      gridTemplateColumns: {
        '5': 'repeat(5, minmax(0, 1fr))'
      }
    }
  }
};
