import React, { useState } from 'react';
import { Routes, Route, BrowserRouter } from 'react-router-dom';
import { CalimeroProvider, AppMode } from '@calimero-network/calimero-client';
import { ToastProvider } from '@calimero-network/mero-ui';

import MatchPage from './pages/match';
import TicTacToePage from './pages/tic-tac-toe';
import Authenticate from './pages/login/Authenticate';

export default function App() {
  const [clientAppId] = useState<string>(
    '36BREwJPfxv2GPc1sSNmdAbTqTNzuhiWszfcwBS57krn',
  );

  return (
    <CalimeroProvider
      clientApplicationId={clientAppId}
      applicationPath={window.location.pathname || '/'}
      mode={AppMode.MultiContext}
    >
      <ToastProvider>
        <BrowserRouter basename="/">
          <Routes>
            <Route path="/" element={<Authenticate />} />
            <Route path="/match" element={<MatchPage />} />
            <Route path="/tic-tac-toe" element={<TicTacToePage />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </CalimeroProvider>
  );
}
