import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import CreateQuiz from './pages/CreateQuiz'
import JoinQuiz from './pages/JoinQuiz'
import Lobby from './pages/Lobby'
import PlayQuiz from './pages/PlayQuiz'
import Results from './pages/Results'
import { SupabaseProvider } from './contexts/SupabaseContext'
import { WalletProvider } from './contexts/WalletContext'
import { GameProvider } from './contexts/GameContext'

function App() {
  return (
    <WalletProvider>
      <SupabaseProvider>
        <GameProvider>
          <Router>
          <div className="min-h-screen bg-gray-50">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/create" element={<CreateQuiz />} />
              <Route path="/join" element={<JoinQuiz />} />
              <Route path="/lobby/:roomCode" element={<Lobby />} />
              <Route path="/play/:roomCode" element={<PlayQuiz />} />
              <Route path="/results/:roomCode" element={<Results />} />
            </Routes>
          </div>
        </Router>
        </GameProvider>
      </SupabaseProvider>
    </WalletProvider>
  )
}

export default App