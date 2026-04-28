import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    // Check localStorage first, then system preference
    const stored = localStorage.getItem('theme');
    if (stored) return stored;

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleTheme();
    }
  };

  const isDark = theme === 'dark';

  return (
    <div
      role="switch"
      aria-checked={isDark}
      aria-label="Theme toggle"
      tabIndex={0}
      onClick={toggleTheme}
      onKeyDown={handleKeyDown}
      style={{
        position: 'relative',
        width: 52,
        height: 26,
        background: 'var(--bg-3)',
        border: '1px solid var(--border)',
        borderRadius: 13,
        cursor: 'pointer',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}
    >
      {/* Sliding pill */}
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: isDark ? 2 : 26,
          width: 22,
          height: 22,
          background: isDark ? '#1f6feb' : '#d29922',
          borderRadius: 11,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          transition: 'left 0.2s ease-in-out, background 0.2s',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        }}
      >
        {isDark ? '🌙' : '☀️'}
      </div>
    </div>
  );
}
