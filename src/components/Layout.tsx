import React from 'react';
import { useGameStore } from '../store/useGameStore';
import {
  Building2,
  Calendar,
  DollarSign,
  Eye,
  LayoutDashboard,
  Medal,
  Trophy,
  User,
  Users,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { AuthButton } from './AuthButton';
import { TeamFlag } from './ui/TeamFlag';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const teams = useGameStore(state => state.teams);
  const userTeamId = useGameStore(state => state.userTeamId);
  const userPlayerId = useGameStore(state => state.userPlayerId);
  const gameMode = useGameStore(state => state.gameMode);
  const currentWeek = useGameStore(state => state.currentWeek);

  const userTeam = teams.find(team => team.id === userTeamId);
  const userPlayer = userTeam?.players.find(player => player.id === userPlayerId);

  if (!userTeam) return <>{children}</>;

  const managerTabs = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'calendar', label: 'Agenda', icon: Calendar },
    { id: 'squad', label: 'Plantel', icon: Users },
    { id: 'scout', label: 'Plantéis', icon: Eye },
    { id: 'market', label: 'Mercado', icon: DollarSign },
    { id: 'club', label: 'Clube/Estádio', icon: Building2 },
    { id: 'standings', label: 'Competições', icon: Trophy },
    { id: 'match', label: 'Próximo Jogo', icon: Calendar },
    { id: 'ranking', label: 'Ranking', icon: Medal },
  ];

  const playerTabs = [
    { id: 'dashboard', label: 'Meu Jogador', icon: User },
    { id: 'calendar', label: 'Agenda', icon: Calendar },
    { id: 'squad', label: 'Elenco', icon: Users },
    { id: 'scout', label: 'Plantéis', icon: Eye },
    { id: 'standings', label: 'Competições', icon: Trophy },
    { id: 'match', label: 'Próximo Jogo', icon: Calendar },
    { id: 'ranking', label: 'Ranking', icon: Medal },
  ];

  const tabs = gameMode === 'player' ? playerTabs : managerTabs;

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 font-sans text-slate-100 md:flex-row">
      <aside className="flex w-full flex-col border-r border-slate-800 bg-slate-950 md:w-64">
        <div className="border-b border-slate-800 p-6">
          <h1 className="bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-2xl font-black tracking-tight text-transparent">
              FUTBOSS
          </h1>
          <div className="mt-4">
            {gameMode === 'player' && userPlayer ? (
              <>
                <h2 className="text-lg font-bold text-slate-200">{userPlayer.name}</h2>
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-400">
                  <TeamFlag country={userTeam.country} teamName={userTeam.name} size="xs" />
                  <span>{userTeam.name}</span>
                </p>
              </>
            ) : (
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-200">
                <TeamFlag country={userTeam.country} teamName={userTeam.name} size="xs" />
                <span>{userTeam.name}</span>
              </h2>
            )}
            <p className="mt-1 text-sm text-slate-400">Semana {currentWeek}</p>
          </div>
        </div>

        <nav className="custom-scrollbar flex-1 space-y-2 overflow-y-auto p-4">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                  'flex items-center gap-3',
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
                )}
              >
                <Icon className="h-5 w-5" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="space-y-4 border-t border-slate-800 p-4">
          <AuthButton />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-slate-900 p-6 md:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
