import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PickerPage from './pages/PickerPage.jsx';
import ReplayPage from './pages/ReplayPage.jsx';
import ExportEditorPage from './pages/ExportEditorPage.jsx';
import EditorPage from './pages/EditorPage.jsx';
import './app.css';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PickerPage />} />
      <Route path="/replay/:sessionId" element={<ReplayPage />} />
      <Route path="/export/:sessionId" element={<ExportEditorPage />} />
      <Route path="/editor/:sessionId" element={<EditorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
