import React, { useState, useEffect, useRef } from 'react';
import { searchIndex } from '../../lib/search/buildSearchIndex.js';

export default function SearchBar({ index, onMatches, onJump, onClear }) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [cursor, setCursor] = useState(0);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const results = searchIndex(index, query);
      setMatches(results);
      setCursor(0);
      onMatches(results);
      if (results.length > 0) onJump(results[0]);
    }, 150);
    return () => clearTimeout(debounceRef.current);
  }, [query, index]);

  function advance(dir) {
    if (!matches.length) return;
    const next = (cursor + dir + matches.length) % matches.length;
    setCursor(next);
    onJump(matches[next]);
  }

  function handleKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); advance(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape') { setQuery(''); setMatches([]); onMatches([]); onClear(); inputRef.current?.blur(); }
  }

  const hasMatches = matches.length > 0;
  const empty = query.length > 0 && !hasMatches;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, maxWidth: 340 }}>
      <div style={{ position: 'relative', flex: 1 }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search steps… (Enter to jump)"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          style={{
            width: '100%',
            padding: '5px 10px',
            paddingRight: hasMatches ? 80 : 10,
            background: 'var(--bg-2)',
            border: `1px solid ${empty ? 'var(--red)' : hasMatches ? 'var(--yellow)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: 12,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {hasMatches && (
          <span style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            fontSize: 10, color: 'var(--yellow)', fontFamily: 'var(--font-mono)', pointerEvents: 'none',
          }}>
            {cursor + 1}/{matches.length}
          </span>
        )}
      </div>
      {hasMatches && (
        <>
          <button onClick={() => advance(-1)} title="Previous match (Shift+Enter)"
            style={{ padding: '4px 7px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}>↑</button>
          <button onClick={() => advance(1)} title="Next match (Enter)"
            style={{ padding: '4px 7px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11 }}>↓</button>
        </>
      )}
    </div>
  );
}
