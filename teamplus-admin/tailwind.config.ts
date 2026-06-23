import type { Config } from 'tailwindcss';

const config: Config = {
    darkMode: ['class'],
    content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
  	extend: {
  		colors: {
  			primary: {
  				DEFAULT: 'hsl(var(--ice-primary))',
  				foreground: 'hsl(var(--primary-foreground))',
  				dark: 'hsl(var(--ice-primary-dark))',
  				light: 'hsl(var(--ice-primary-light))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			success: 'hsl(var(--ice-success))',
  			warning: 'hsl(var(--ice-warning))',
  			error: 'hsl(var(--ice-error))',
  			neutral: {
  				'50': 'hsl(var(--ice-slate-50))',
  				'100': 'hsl(var(--ice-slate-100))',
  				'200': 'hsl(var(--ice-slate-200))',
  				'300': 'hsl(var(--ice-slate-300))',
  				'400': 'hsl(var(--ice-slate-400))',
  				'500': 'hsl(var(--ice-slate-500))',
  				'600': 'hsl(var(--ice-slate-600))',
  				'700': 'hsl(var(--ice-slate-700))',
  				'800': 'hsl(var(--ice-slate-800))',
  				'900': 'hsl(var(--ice-slate-900))'
  			},
  			background: 'var(--color-background)',
  			surface: 'var(--color-surface)',
  			border: 'var(--color-border)',
  			foreground: 'var(--color-text-primary)',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'admin-fade-in': {
  				from: { opacity: '0' },
  				to: { opacity: '1' },
  			},
  			'admin-slide-up': {
  				from: { opacity: '0' },
  				to: { opacity: '1' },
  			},
  			'admin-scale-in': {
  				from: { opacity: '0' },
  				to: { opacity: '1' },
  			},
  		},
  		animation: {
  			'admin-fade-in': 'admin-fade-in 0.3s ease-out both',
  			'admin-slide-up': 'admin-slide-up 0.35s ease-out both',
  			'admin-scale-in': 'admin-scale-in 0.2s ease-out both',
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
