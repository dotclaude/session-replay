import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PickerPage from './pages/PickerPage.jsx';
import ReplayPage from './pages/ReplayPage.jsx';
import AgentReplayPage from './pages/AgentReplayPage.jsx';
import ExportEditorPage from './pages/ExportEditorPage.jsx';
import EditorPage from './pages/EditorPage.jsx';
import { SessionProvider } from './lib/SessionProvider.ts';
import { SessionProviderContext } from './lib/SessionProviderContext.jsx';
import { getSavedSessionsDirectory } from './lib/fsAccess.ts';
import './app.css';

export default function App() {
  const [provider, setProvider] = useState(() => new SessionProvider(null));

  const reinitialise = useCallback(async () => {
    try {
      const handle = await getSavedSessionsDirectory();
      setProvider(new SessionProvider(handle ?? null));
    } catch {
      setProvider(new SessionProvider(null));
    }
  }, []);

  // Boot: load persisted FS handle from IndexedDB
  useEffect(() => {
    reinitialise();
  }, [reinitialise]);

  return (
    <SessionProviderContext.Provider value={{ provider, reinitialise }}>
      <Routes>
        <Route path="/" element={<PickerPage />} />
        <Route path="/replay/:sessionId" element={<ReplayPage />} />
        <Route path="/replay/:sessionId/agent/:agentId" element={<AgentReplayPage />} />
        <Route path="/export/:sessionId" element={<ExportEditorPage />} />
        <Route path="/editor/:sessionId" element={<EditorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionProviderContext.Provider>
  );
}
