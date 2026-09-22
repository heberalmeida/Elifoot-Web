import React, { useMemo, useState } from 'react';
import { Medal, Star, Trophy, Users } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { Competition, Player, Position, Team } from '../types/game';
import { PageHeader } from './ui/PageHeader';
import { TeamFlag } from './ui/TeamFlag';

const formatOrdinal = (position: number) => `${position}°`;

const COMPETITION_OPTIONS: Array<{ value: 'ALL' | Competition; label: string }> = [
  { value: 'ALL', label: 'Todos os campeonatos' },
  { value: 'LEAGUE', label: 'Campeonato Nacional' },
  { value: 'REGIONAL', label: 'Regional' },
  { value: 'NATIONAL_CUP', label: 'Copa Nacional' },
  { value: 'CONTINENTAL', label: 'Continental' },
  { value: 'CONTINENTAL_SECONDARY', label: 'Continental Secundario' },
  { value: 'WORLD_CUP', label: 'World Cup' },
  { value: 'OLYMPICS', label: 'Olympics' },
];

const POSITION_OPTIONS: Array<{ value: 'ALL' | Position; label: string }> = [
  { value: 'ALL', label: 'Todas as posicoes' },
  { value: 'GK', label: 'Goleiros' },
  { value: 'DEF', label: 'Defensores' },
  { value: 'MID', label: 'Meio-campistas' },
  { value: 'ATK', label: 'Atacantes' },
];

const formatDivision = (division: number) => {
  if (division <= 0) return 'Selecao';
  return `Serie ${['A', 'B', 'C', 'D'][division - 1] ?? division}`;
};

const getTeamCompetitionScore = (team: Team, competitionFilter: 'ALL' | Competition) => {
  if (competitionFilter === 'ALL') {
    return team.historicalPoints;
  }

  const stats = team.stats[competitionFilter];
  if (!stats) return 0;
  return stats.wins * 3 + stats.draws;
};

const getPlayerRankingScore = (player: Player) => {
  const averageRating = player.averageRating ?? 6;
  const form = player.form ?? 0;
  const overall = player.overall ?? 0;
  const titles = player.titlesWon ?? 0;

  switch (player.position) {
    case 'GK':
      return (
        (player.cleanSheets ?? 0) * 6 +
        (player.saves ?? 0) * 1.5 +
        (player.savePercentage ?? 0) * 0.25 +
        averageRating * 10 +
        form * 3 +
        overall +
        titles * 5
      );
    case 'DEF':
      return (
        (player.tackles ?? 0) * 2.4 +
        (player.interceptions ?? 0) * 2.2 +
        (player.cleanSheets ?? 0) * 4 +
        averageRating * 10 +
        form * 3 +
        overall +
        titles * 5
      );
    case 'MID':
      return (
        player.assists * 4 +
        (player.keyPasses ?? 0) * 2.2 +
        (player.passAccuracy ?? 0) * 0.2 +
        averageRating * 10 +
        form * 3 +
        overall +
        titles * 5
      );
    case 'ATK':
    default:
      return (
        player.goals * 5 +
        player.assists * 3 +
        averageRating * 10 +
        form * 3 +
        overall +
        titles * 5
      );
  }
};

const getPositionLabel = (position: Position) => {
  switch (position) {
    case 'GK':
      return 'GOL';
    case 'DEF':
      return 'DEF';
    case 'MID':
      return 'MEI';
    case 'ATK':
      return 'ATA';
    default:
      return position;
  }
};

const renderPositionCell = (index: number) => {
  if (index === 0) return <Medal className="mx-auto h-6 w-6 text-yellow-400" />;
  if (index === 1) return <Medal className="mx-auto h-6 w-6 text-slate-300" />;
  if (index === 2) return <Medal className="mx-auto h-6 w-6 text-amber-600" />;
  return <span className="font-bold text-slate-500">{formatOrdinal(index + 1)}</span>;
};

function RankingFilters({
  countries,
  teams,
  searchTerm,
  setSearchTerm,
  competitionFilter,
  setCompetitionFilter,
  countryFilter,
  setCountryFilter,
  teamFilter,
  setTeamFilter,
  divisionFilter,
  setDivisionFilter,
  positionFilter,
  setPositionFilter,
  showPositionFilter,
  searchLabel,
  searchPlaceholder,
}: {
  countries: string[];
  teams: Team[];
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  competitionFilter: 'ALL' | Competition;
  setCompetitionFilter: (value: 'ALL' | Competition) => void;
  countryFilter: string;
  setCountryFilter: (value: string) => void;
  teamFilter: string;
  setTeamFilter: (value: string) => void;
  divisionFilter: string;
  setDivisionFilter: (value: string) => void;
  positionFilter: 'ALL' | Position;
  setPositionFilter: (value: 'ALL' | Position) => void;
  showPositionFilter: boolean;
  searchLabel: string;
  searchPlaceholder: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-700 bg-slate-800/90 p-4 md:grid-cols-2 xl:grid-cols-6">
      <label className="space-y-2">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{searchLabel}</span>
        <input
          value={searchTerm}
          onChange={event => setSearchTerm(event.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-emerald-500"
        />
      </label>

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
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Equipe</span>
        <select
          value={teamFilter}
          onChange={event => setTeamFilter(event.target.value)}
          className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
        >
          <option value="ALL">Todas as equipes</option>
          {teams.map(team => (
            <option key={team.id} value={team.id}>
              {team.name}
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

      {showPositionFilter ? (
        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Posicao</span>
          <select
            value={positionFilter}
            onChange={event => setPositionFilter(event.target.value as 'ALL' | Position)}
            className="w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-500"
          >
            {POSITION_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          Ranking de clubes com filtros por campeonato, pais, equipe e divisao.
        </div>
      )}
    </div>
  );
}

export function Ranking({
  onViewSquad,
}: {
  onViewSquad?: (teamId: string, competition?: 'ALL' | Competition) => void;
}) {
  const teams = useGameStore(state => state.teams);
  const gameMode = useGameStore(state => state.gameMode);
  const userTeamId = useGameStore(state => state.userTeamId);
  const userPlayerId = useGameStore(state => state.userPlayerId);

  const [searchTerm, setSearchTerm] = useState('');
  const [competitionFilter, setCompetitionFilter] = useState<'ALL' | Competition>('ALL');
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [divisionFilter, setDivisionFilter] = useState('ALL');
  const [positionFilter, setPositionFilter] = useState<'ALL' | Position>('ALL');

  const clubTeams = useMemo(
    () => teams.filter(team => team.division > 0).sort((teamA, teamB) => teamA.name.localeCompare(teamB.name)),
    [teams],
  );

  const countries = useMemo(
    () => [...new Set(clubTeams.map(team => team.country))].sort((countryA, countryB) => countryA.localeCompare(countryB)),
    [clubTeams],
  );

  const filteredTeams = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLocaleLowerCase('pt-BR');

    return clubTeams
      .filter(team => (normalizedSearchTerm.length === 0 ? true : team.name.toLocaleLowerCase('pt-BR').includes(normalizedSearchTerm)))
      .filter(team => (countryFilter === 'ALL' ? true : team.country === countryFilter))
      .filter(team => (teamFilter === 'ALL' ? true : team.id === teamFilter))
      .filter(team => (divisionFilter === 'ALL' ? true : String(team.division) === divisionFilter))
      .filter(team => (competitionFilter === 'ALL' ? true : (team.stats[competitionFilter]?.played ?? 0) > 0))
      .sort((teamA, teamB) => {
        if (competitionFilter !== 'ALL') {
          const statsA = teamA.stats[competitionFilter];
          const statsB = teamB.stats[competitionFilter];
          const pointsDiff =
            ((statsB?.wins ?? 0) * 3 + (statsB?.draws ?? 0)) - ((statsA?.wins ?? 0) * 3 + (statsA?.draws ?? 0));
          if (pointsDiff !== 0) return pointsDiff;

          const goalDiffA = (statsA?.goalsFor ?? 0) - (statsA?.goalsAgainst ?? 0);
          const goalDiffB = (statsB?.goalsFor ?? 0) - (statsB?.goalsAgainst ?? 0);
          const goalDiff = goalDiffB - goalDiffA;
          if (goalDiff !== 0) return goalDiff;

          const goalsForDiff = (statsB?.goalsFor ?? 0) - (statsA?.goalsFor ?? 0);
          if (goalsForDiff !== 0) return goalsForDiff;
        }

        return getTeamCompetitionScore(teamB, competitionFilter) - getTeamCompetitionScore(teamA, competitionFilter);
      });
  }, [clubTeams, competitionFilter, countryFilter, divisionFilter, searchTerm, teamFilter]);

  const filteredPlayers = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLocaleLowerCase('pt-BR');

    return clubTeams
      .filter(team => (countryFilter === 'ALL' ? true : team.country === countryFilter))
      .filter(team => (teamFilter === 'ALL' ? true : team.id === teamFilter))
      .filter(team => (divisionFilter === 'ALL' ? true : String(team.division) === divisionFilter))
      .filter(team => (competitionFilter === 'ALL' ? true : (team.stats[competitionFilter]?.played ?? 0) > 0))
      .flatMap(team =>
        team.players
          .filter(player => player.status !== 'RETIRED')
          .filter(player =>
            normalizedSearchTerm.length === 0
              ? true
              : player.name.toLocaleLowerCase('pt-BR').includes(normalizedSearchTerm),
          )
          .filter(player => (positionFilter === 'ALL' ? true : player.position === positionFilter))
          .map(player => ({
            player,
            team,
            score: getPlayerRankingScore(player),
          })),
      )
      .sort((entryA, entryB) => {
        const scoreDiff = entryB.score - entryA.score;
        if (scoreDiff !== 0) return scoreDiff;

        const ratingDiff = (entryB.player.averageRating ?? 0) - (entryA.player.averageRating ?? 0);
        if (ratingDiff !== 0) return ratingDiff;

        const goalDiff = entryB.player.goals - entryA.player.goals;
        if (goalDiff !== 0) return goalDiff;

        return entryB.player.overall - entryA.player.overall;
      });
  }, [clubTeams, competitionFilter, countryFilter, divisionFilter, positionFilter, searchTerm, teamFilter]);

  const isPlayerMode = gameMode === 'player';

  return (
    <div className="space-y-6">
      <PageHeader
        title={isPlayerMode ? 'Ranking de Jogadores' : 'Ranking de Clubes'}
        subtitle={
          isPlayerMode
            ? 'Desempenho individual com filtros por campeonato, equipe, pais e posicao.'
            : 'Classificacao de clubes com filtros por campeonato, equipe, pais e divisao.'
        }
        icon={isPlayerMode ? <Users className="h-7 w-7" /> : <Trophy className="h-7 w-7" />}
      />

      <RankingFilters
        countries={countries}
        teams={clubTeams}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        competitionFilter={competitionFilter}
        setCompetitionFilter={setCompetitionFilter}
        countryFilter={countryFilter}
        setCountryFilter={setCountryFilter}
        teamFilter={teamFilter}
        setTeamFilter={setTeamFilter}
        divisionFilter={divisionFilter}
        setDivisionFilter={setDivisionFilter}
        positionFilter={positionFilter}
        setPositionFilter={setPositionFilter}
        showPositionFilter={isPlayerMode}
        searchLabel={isPlayerMode ? 'Jogador' : 'Time'}
        searchPlaceholder={isPlayerMode ? 'Digite o nome do jogador' : 'Digite o nome do time'}
      />

      {!isPlayerMode ? (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/50">
                  <th className="w-16 p-4 text-center font-medium text-slate-400">Pos</th>
                  <th className="p-4 font-medium text-slate-400">Clube</th>
                  <th className="p-4 text-center font-medium text-slate-400">Pais</th>
                  <th className="p-4 text-center font-medium text-slate-400">Divisao</th>
                  <th className="p-4 text-right font-medium text-slate-400">
                    {competitionFilter === 'ALL' ? 'Pontos Historicos' : 'Pontos'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredTeams.map((team, index) => (
                  <tr
                    key={team.id}
                    className={`transition-colors hover:bg-slate-700/30 ${team.id === userTeamId ? 'bg-emerald-900/20' : ''}`}
                  >
                    <td className="p-4 text-center">{renderPositionCell(index)}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <TeamFlag country={team.country} teamName={team.name} size="xs" />
                        <span className={`font-bold ${team.id === userTeamId ? 'text-emerald-400' : 'text-slate-200'}`}>
                          {team.name}
                        </span>
                        {team.id === userTeamId && <Star className="h-4 w-4 fill-emerald-400 text-emerald-400" />}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span className="rounded bg-slate-700 px-2 py-1 text-xs font-bold text-slate-300">{team.country}</span>
                    </td>
                    <td className="p-4 text-center text-slate-400">{formatDivision(team.division)}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <span className="text-lg font-bold text-yellow-400">
                          {getTeamCompetitionScore(team, competitionFilter).toLocaleString('pt-BR')}
                        </span>
                        {onViewSquad && (
                          <button
                            type="button"
                            onClick={() => onViewSquad(team.id, competitionFilter)}
                            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-bold text-emerald-400 transition hover:border-emerald-500 hover:bg-slate-800"
                          >
                            Ver plantel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/50">
                  <th className="w-16 p-4 text-center font-medium text-slate-400">Pos</th>
                  <th className="p-4 font-medium text-slate-400">Jogador</th>
                  <th className="p-4 text-center font-medium text-slate-400">Equipe</th>
                  <th className="p-4 text-center font-medium text-slate-400">Pais</th>
                  <th className="p-4 text-center font-medium text-slate-400">Posicao</th>
                  <th className="p-4 text-center font-medium text-slate-400">OVR</th>
                  <th className="p-4 text-center font-medium text-slate-400">G</th>
                  <th className="p-4 text-center font-medium text-slate-400">A</th>
                  <th className="p-4 text-center font-medium text-slate-400">Nota</th>
                  <th className="p-4 text-right font-medium text-slate-400">Indice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {filteredPlayers.map(({ player, team, score }, index) => (
                  <tr
                    key={player.id}
                    className={`transition-colors hover:bg-slate-700/30 ${player.id === userPlayerId ? 'bg-emerald-900/20' : ''}`}
                  >
                    <td className="p-4 text-center">{renderPositionCell(index)}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <span className={`font-bold ${player.id === userPlayerId ? 'text-emerald-400' : 'text-slate-200'}`}>
                          {player.name}
                        </span>
                        {player.id === userPlayerId && <Star className="h-4 w-4 fill-emerald-400 text-emerald-400" />}
                      </div>
                    </td>
                    <td className="p-4 text-center text-slate-300">
                      <button
                        type="button"
                        onClick={() => onViewSquad?.(team.id, competitionFilter)}
                        className="inline-flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-slate-700/60 hover:text-emerald-400"
                      >
                        <TeamFlag country={team.country} teamName={team.name} size="xs" />
                        <span>{team.name}</span>
                      </button>
                    </td>
                    <td className="p-4 text-center">
                      <span className="rounded bg-slate-700 px-2 py-1 text-xs font-bold text-slate-300">
                        {team.country}
                      </span>
                    </td>
                    <td className="p-4 text-center text-slate-300">{getPositionLabel(player.position)}</td>
                    <td className="p-4 text-center text-slate-200">{player.overall}</td>
                    <td className="p-4 text-center text-slate-200">{player.goals}</td>
                    <td className="p-4 text-center text-slate-200">{player.assists}</td>
                    <td className="p-4 text-center text-slate-200">{(player.averageRating ?? 0).toFixed(1)}</td>
                    <td className="p-4 text-right">
                      <span className="text-lg font-bold text-yellow-400">{Math.round(score).toLocaleString('pt-BR')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
