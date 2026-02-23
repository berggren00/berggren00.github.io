import { useState } from 'react';
import { useGame } from './useGame';
import { BonfireScreen } from './BonfireScreen';
import { WorkoutScreen } from './WorkoutScreen';
import { CharacterScreen } from './CharacterScreen';
import './index.css';

type Tab = 'bonfire' | 'workout' | 'character';

const TAB_ICONS: Record<Tab, string> = {
  bonfire: '◈',
  workout: '⚔',
  character: '☽',
};

const TAB_LABELS: Record<Tab, string> = {
  bonfire: 'BONFIRE',
  workout: 'TRIALS',
  character: 'VESSEL',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('bonfire');
  const game = useGame();

  if (game.loading) {
    return (
      <div className="app loading-screen">
        <div className="loading-flame">🔥</div>
        <div className="loading-text">KINDLING THE FLAME</div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className={`screen-container ${activeTab === 'bonfire' ? 'bonfire-static' : ''}`}>
        {activeTab === 'bonfire' && (
          <BonfireScreen game={game} onNavigate={(tab) => setActiveTab(tab)} />
        )}
        {activeTab === 'workout' && (
          <WorkoutScreen game={game} onBack={() => setActiveTab('bonfire')} />
        )}
        {activeTab === 'character' && (
          <CharacterScreen game={game} />
        )}
      </div>

      <nav className="tab-bar">
        {(['bonfire', 'workout', 'character'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            <span className="tab-icon">{TAB_ICONS[tab]}</span>
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>
    </div>
  );
}
