import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/auth/protected-route';
import LoginPage from './pages/auth/login';
import RegisterPage from './pages/auth/register';
import LobbyPage from './pages/lobby';
import CreateRoomPage from './pages/room/create';
import WaitingRoomPage from './pages/room/waiting';
import GamePage from './pages/game/playing';
import GameOverPage from './pages/game-over/result';
import { ErrorBoundary } from './components/error-boundary';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
        <Route path="/rooms/create" element={<ProtectedRoute><CreateRoomPage /></ProtectedRoute>} />
        <Route path="/rooms/:roomCode" element={<ProtectedRoute><WaitingRoomPage /></ProtectedRoute>} />
        <Route path="/game/:gameId" element={<ProtectedRoute><ErrorBoundary><GamePage /></ErrorBoundary></ProtectedRoute>} />
        <Route path="/game/:gameId/over" element={<ProtectedRoute><ErrorBoundary><GameOverPage /></ErrorBoundary></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/lobby" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
