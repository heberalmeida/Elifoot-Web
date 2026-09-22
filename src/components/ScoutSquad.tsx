import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Search, Star, Users } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { getCompetitionPlayers } from '../store/gameStateHelpers';
import { cn, findPlayerClub } from '../lib/utils';
import { Competition, Player, Position, Team } from '../types/game';
import { PageHeader } from './ui/PageHeader';
import { TeamFlag } from './ui/TeamFlag';

const COMPETITION_OPTIONS: Array<{ value: 'ALL' | Competition; label: string }> = [
  { value: 'ALL', label: 'Elenco do clube' },
  { value: 'LEAGUE', label: 'Campeonato Nacional' },
  { value: 'REGIONAL', label: 'Regional' },
  { value: 'NATIONAL_CUP', label: 'Copa Nacional' },
  { value: 'CONTINENTAL', label: 'Continental' },
  { value: 'CONTINENTAL_SECONDARY', label: 'Continental Secundario' },
  { value: 'WORLD_CUP', label: 'World Cup' },
  { value: 'OLYMPICS', label: 'Olympics' },
];

const INTERNATIONAL_COMPETITIONS: Competition[] = ['WORLD_CUP', 'OLYMPICS'];

const formatDivision = (division: number) => {
  if (division <= 0) return 'Selecao';
  return `Serie ${['A', 'B', 'C', 'D'][division - 1] ?? division}`;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

const getPositionBadge = (position: string) => {
  switch (position) {
    case 'GK':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'DEF':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'MID':
      return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'ATK':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    default:
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
};

const sortPlayers = (players: Player[]) => {
  const posOrder = { GK: 1, DEF: 2, MID: 3, ATK: 4 };
  return [...players].sort((playerA, playerB) => {
    if (posOrder[playerA.position] !== posOrder[playerB.position]) {
      return posOrder[playerA.position] - posOrder[playerB.position];
    }
    return playerB.overall - playerA.overall;
  });
};

const teamParticipatesInCompetition = (team: Team, competition: Competition) => {
  if (INTERNATIONAL_COMPETITIONS.includes(competition)) {
    return (
      team.division === 0 ||
      Boolean(team.competitionSquads?.[competition]?.length) ||
      (team.stats[competition]?.played ?? 0) > 0
    );
  }
  return (team.stats[competition]?.played ?? 0) > 0 || team.division > 0;
};

export interface ScoutSquadProps {
  initialTeamId?: string | null;
  initialCompetition?: 'ALL' | Competition | null;
}

export function ScoutSquad({ initialTeamId = null, initialCompetition = null }: ScoutSquadProps) {
  const teams = useGameStore(state => state.teams);
  const userTeamId = useGameStore(state => state.userTeamId);

  const [competitionFilter, setCompetitionFilter] = useState<'ALL' | Competition>(initialCompetition ?? 'ALL');
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [divisionFilter, setDivisionFilter] = useState('ALL');
  const [selectedTeamId, setSelectedTeamId] = useState<string>(initialTeamId ?? userTeamId ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [positionFilter, setPositionFilter] = useState<Position | null>(null);
  const [activeTab, setActiveTab] = useState<'roster' | 'stats'>('roster');

  useEffect(() => {
    if (initialTeamId) {
      setSelectedTeamId(initialTeamId);
    }
  }, [initialTeamId]);

  useEffect(() => {
    if (initialCompetition) {
      setCompetitionFilter(initialCompetition);
    }
  }, [initialCompetition]);

  const isInternational = INTERNATIONAL_COMPETITIONS.includes(competitionFilter as Competition);

  const availableTeams = useMemo(() => {
    return teams
      .filter(team => {
        if (competitionFilter === 'ALL') return true;
        if (isInternational) return teamParticipatesInCompetition(team, competitionFilter);
        return team.division > 0;
      })
      .filter(team => (countryFilter === 'ALL' ? true : team.country === countryFilter))
      .filter(team => {
        if (divisionFilter === 'ALL') return true;
        return String(team.division) === divisionFilter;
      })
      .sort((teamA, teamB) => teamA.name.localeCompare(teamB.name, 'pt-BR'));
  }, [competitionFilter, countryFilter, divisionFilter, isInternational, teams]);

  const countries = useMemo(
    () =>
      [...new Set(availableTeams.map(team => team.country))].sort((countryA, countryB) =>
        countryA.localeCompare(countryB, 'pt-BR'),
      ),
    [availableTeams],
  );

  useEffect(() => {
    if (availableTeams.length === 0) {
      setSelectedTeamId('');
      return;
    }

    if (!availableTeams.some(team => team.id === selectedTeamId)) {
      const preferred =
        availableTeams.find(team => team.id === userTeamId) ??
        availableTeams.find(team => team.id === initialTeamId) ??
        availableTeams[0];
      setSelectedTeamId(preferred.id);
    }
  }, [availableTeams, initialTeamId, selectedTeamId, userTeamId]);

  const selectedTeam = availableTeams.find(team => team.id === selectedTeamId) ?? null;
  const isOwnTeam = selectedTeam?.id === userTeamId;
  const showClubColumn = selectedTeam?.division === 0;

  const squadPlayers = useMemo(() => {
    if (!selectedTeam) return [];
    if (competitionFilter === 'ALL') return selectedTeam.players;
    return getCompetitionPlayers(selectedTeam, competitionFilter);
  }, [competitionFilter, selectedTeam]);

  const clubByPlayerId = useMemo(() => {
    if (!showClubColumn) return new Map<string, Team>();

    const map = new Map<string, Team>();
    squadPlayers.forEach(player => {
      const club = findPlayerClub(teams, player.id);
      if (club) map.set(player.id, club);
    });
    return map;
  }, [showClubColumn, squadPlayers, teams]);

  const filteredPlayers = useMemo(() => {
    return sortPlayers(
      squadPlayers.filter(player => {
        if (player.status === 'RETIRED') return false;
        const matchesPosition = positionFilter ? player.position === positionFilter : true;
        const matchesSearch = player.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesPosition && matchesSearch;
      }),
    );
  }, [positionFilter, searchQuery, squadPlayers]);

  const startersCount = squadPlayers.filter(player => player.isStarter).length;
  const averageOverall =
    filteredPlayers.length > 0
      ? Math.round(filteredPlayers.reduce((sum, player) => sum + player.overall, 0) / filteredPlayers.length)
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plantéis"
        subtitle="Explore o elenco de qualquer time e alterne entre campeonatos para ver convocações e plantéis específicos."
        icon={<Users className="h-7 w-7" />}
      />

      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-700 bg-slate-800/90 p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Campeonato</span>
          <select
            value={competitionFilter}
            onChange={event => setCompetitionFilter(event.target.value as 'ALL' | Competition)}
            className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
          >
            {COMPETITION_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Pais</span>
          <select
            value={countryFilter}
            onChange={event => setCountryFilter(event.target.value)}
            className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
          >
            <option value="ALL">Todos os paises</option>
            {countries.map(country => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Divisao</span>
          <select
            value={divisionFilter}
            onChange={event => setDivisionFilter(event.target.value)}
            className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
          >
            <option value="ALL">Todas as divisoes</option>
            <option value="1">Serie A</option>
            <option value="2">Serie B</option>
            <option value="3">Serie C</option>
            <option value="4">Serie D</option>
            <option value="0">Selecoes</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Time</span>
          <select
            value={selectedTeamId}
            onChange={event => setSelectedTeamId(event.target.value)}
            className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
          >
            {availableTeams.length === 0 ? (
              <option value="">Nenhum time encontrado</option>
            ) : (
              availableTeams.map(team => (
                <option key={team.id} value={team.id}>
                  {team.name}
                  {team.id === userTeamId ? ' (seu time)' : ''}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      {selectedTeam ? (
        <>
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-800/80 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <TeamFlag country={selectedTeam.country} teamName={selectedTeam.name} size="md" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold text-slate-100">{selectedTeam.name}</h2>
                  {isOwnTeam && <Star className="h-5 w-5 fill-emerald-400 text-emerald-400" />}
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  {selectedTeam.country} · {formatDivision(selectedTeam.division)}
                  {competitionFilter !== 'ALL'
                    ? ` · ${COMPETITION_OPTIONS.find(option => option.value === competitionFilter)?.label}`
                    : ''}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Jogadores</p>
                <p className="text-lg font-bold text-slate-100">{squadPlayers.length}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Titulares</p>
                <p className="text-lg font-bold text-emerald-400">{startersCount}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">OVR medio</p>
                <p className="text-lg font-bold text-yellow-400">{averageOverall}</p>
              </div>
            </div>
          </div>

          <div className="flex space-x-2 border-b border-slate-800 pb-px">
            <button
              onClick={() => setActiveTab('roster')}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'roster'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700',
              )}
            >
              <Users className="w-4 h-4" />
              Elenco
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeTab === 'stats'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700',
              )}
            >
              <BarChart3 className="w-4 h-4" />
              Estatisticas
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-500" />
              </div>
              <input
                type="text"
                placeholder="Buscar jogador..."
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-slate-700 rounded-lg leading-5 bg-slate-800 text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm transition-colors"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-400 mr-2">Posicao:</span>
              {(['GK', 'DEF', 'MID', 'ATK'] as Position[]).map(position => {
                const isActive = positionFilter === position;
                return (
                  <button
                    key={position}
                    onClick={() => setPositionFilter(isActive ? null : position)}
                    className={cn(
                      'px-4 py-1.5 rounded-lg text-sm font-bold border transition-all shadow-sm',
                      isActive
                        ? 'bg-emerald-500 text-emerald-950 border-emerald-500'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white',
                    )}
                  >
                    {position}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
              {filteredPlayers.length === 0 ? (
                <p className="p-8 text-sm text-slate-400">Nenhum jogador encontrado para os filtros atuais.</p>
              ) : activeTab === 'roster' ? (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                    <tr>
                      <th className="px-6 py-4 font-medium">Nome</th>
                      {showClubColumn && <th className="px-6 py-4 font-medium">Clube</th>}
                      <th className="px-6 py-4 font-medium">Pos</th>
                      <th className="px-6 py-4 font-medium text-center">Idade</th>
                      <th className="px-6 py-4 font-medium text-center">Overall</th>
                      <th className="px-6 py-4 font-medium text-center">Energia</th>
                      <th className="px-6 py-4 font-medium text-center">Valor</th>
                      <th className="px-6 py-4 font-medium text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {filteredPlayers.map(player => {
                      const club = clubByPlayerId.get(player.id);
                      return (
                        <tr key={player.id} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-6 py-3 font-medium text-slate-200">
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-2">
                                {player.name}
                                {player.isStarter && (
                                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                                    Titular
                                  </span>
                                )}
                              </span>
                              {player.injury && player.injury.weeksRemaining > 0 && (
                                <span className="w-fit rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                                  Lesionado {player.injury.weeksRemaining}s
                                </span>
                              )}
                            </div>
                          </td>
                          {showClubColumn && (
                            <td className="px-6 py-3 text-slate-300">
                              {club ? (
                                <span className="inline-flex items-center gap-2">
                                  <TeamFlag country={club.country} teamName={club.name} size="xs" />
                                  <span>{club.name}</span>
                                </span>
                              ) : (
                                <span className="text-slate-500">Sem clube</span>
                              )}
                            </td>
                          )}
                          <td className="px-6 py-3">
                            <span className={cn('px-2 py-1 rounded text-xs font-bold border', getPositionBadge(player.position))}>
                              {player.position}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-center text-slate-400">{player.age}</td>
                          <td className="px-6 py-3 text-center font-mono font-bold text-slate-200">{player.overall}</td>
                          <td className="px-6 py-3 text-center text-slate-300">{player.energy}%</td>
                          <td className="px-6 py-3 text-center text-slate-300">{formatCurrency(player.value)}</td>
                          <td className="px-6 py-3 text-center text-slate-400">
                            {player.injury && player.injury.weeksRemaining > 0 ? 'Lesionado' : 'Disponivel'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                    <tr>
                      <th className="px-6 py-4 font-medium">Nome</th>
                      {showClubColumn && <th className="px-6 py-4 font-medium">Clube</th>}
                      <th className="px-6 py-4 font-medium">Pos</th>
                      <th className="px-6 py-4 font-medium text-center">Jogos</th>
                      <th className="px-6 py-4 font-medium text-center">Gols</th>
                      <th className="px-6 py-4 font-medium text-center">Assist.</th>
                      <th className="px-6 py-4 font-medium text-center">Media</th>
                      <th className="px-6 py-4 font-medium text-center">Clean</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {filteredPlayers.map(player => {
                      const club = clubByPlayerId.get(player.id);
                      return (
                        <tr key={player.id} className="hover:bg-slate-700/30 transition-colors">
                          <td className="px-6 py-3 font-medium text-slate-200">{player.name}</td>
                          {showClubColumn && (
                            <td className="px-6 py-3 text-slate-300">
                              {club ? (
                                <span className="inline-flex items-center gap-2">
                                  <TeamFlag country={club.country} teamName={club.name} size="xs" />
                                  <span>{club.name}</span>
                                </span>
                              ) : (
                                <span className="text-slate-500">Sem clube</span>
                              )}
                            </td>
                          )}
                          <td className="px-6 py-3">
                            <span className={cn('px-2 py-1 rounded text-xs font-bold border', getPositionBadge(player.position))}>
                              {player.position}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-center text-slate-300">{player.matchesPlayed}</td>
                          <td className="px-6 py-3 text-center font-bold text-emerald-400">{player.goals}</td>
                          <td className="px-6 py-3 text-center font-bold text-blue-400">{player.assists}</td>
                          <td className="px-6 py-3 text-center text-slate-300">{player.averageRating?.toFixed(2) ?? '0.00'}</td>
                          <td className="px-6 py-3 text-center text-slate-300">{player.cleanSheets ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/40 p-8 text-center text-sm text-slate-400">
          Nenhum time disponivel para os filtros selecionados. Tente outro campeonato, pais ou divisao.
        </div>
      )}
    </div>
  );
}
