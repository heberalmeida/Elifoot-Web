import React, { useState } from 'react';
import { useGameStore } from './store/useGameStore';
import { StartScreen } from './components/StartScreen';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Squad } from './components/Squad';
import { ScoutSquad } from './components/ScoutSquad';
import { Standings } from './components/Standings';
import { MatchDay } from './components/MatchDay';
import { Market } from './components/Market';
import { Club } from './components/Club';
import { Ranking } from './components/Ranking';
import { PlayerDashboard } from './components/PlayerDashboard';
import { CalendarView } from './components/CalendarView';
import { Competition } from './types/game';

export default function App() {
  const { userTeamId, gameMode, startNewGame } = useGameStore();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [scoutTeamId, setScoutTeamId] = useState<string | null>(null);
  const [scoutCompetition, setScoutCompetition] = useState<'ALL' | Competition | null>(null);

  const openScout = (teamId: string, competition: 'ALL' | Competition = 'ALL') => {
    setScoutTeamId(teamId);
    setScoutCompetition(competition);
    setActiveTab('scout');
  };

  if (!userTeamId) {
    return <StartScreen onStart={startNewGame} />;
  }

  const renderContent = () => {
    if (gameMode === 'player' && activeTab === 'dashboard') {
      return <PlayerDashboard />;
    }

    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'squad':
        return <Squad />;
      case 'scout':
        return <ScoutSquad initialTeamId={scoutTeamId} initialCompetition={scoutCompetition} />;
      case 'calendar':
        return <CalendarView />;
      case 'market':
        return <Market />;
      case 'club':
        return <Club />;
      case 'standings':
        return <Standings onViewSquad={openScout} />;
      case 'ranking':
        return <Ranking onViewSquad={openScout} />;
      case 'match':
        return <MatchDay />;
      default:
        return gameMode === 'player' ? <PlayerDashboard /> : <Dashboard />;
    }
  };

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderContent()}
    </Layout>
  );
}
