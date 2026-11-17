'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

function initialDark(): boolean {
  if (typeof window === 'undefined') return false;
  const saved = localStorage.getItem('rd-theme');
  return saved
    ? saved === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState<boolean>(initialDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  function toggle() {
    const next = !dark;
    setDark(next);
    localStorage.setItem('rd-theme', next ? 'dark' : 'light');
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${className}`}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
