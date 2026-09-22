import React, { useMemo, useState } from 'react';
import { Globe, Map as MapIcon, Trophy } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { sortTeamsByCompetitionTable } from '../game/engine';
import { cn, findPlayerClub } from '../lib/utils';
import { Competition, Match, Team } from '../types/game';
import { TeamFlag } from './ui/TeamFlag';

const formatOrdinal = (position: number) => `${position}°`;
const INTERNATIONAL_COMPETITIONS: Competition[] = ['WORLD_CUP', 'OLYMPICS'];

const INTERNATIONAL_TABS: Array<{ id: Competition; label: string; icon: typeof Globe }> = [
  { id: 'WORLD_CUP', label: 'World Cup', icon: Globe },
  { id: 'OLYMPICS', label: 'Olympics', icon: Globe },
];

const DOMESTIC_TABS: Array<{ id: Competition; label: string; icon: typeof Trophy | typeof MapIcon | typeof Globe }> = [
  { id: 'LEAGUE', label: 'Liga Nacional', icon: Trophy },
  { id: 'REGIONAL', label: 'Regional', icon: MapIcon },
  { id: 'NATIONAL_CUP', label: 'Copa Nacional', icon: Trophy },
  { id: 'CONTINENTAL', label: 'Continental', icon: Globe },
];

const getCompetitionTitle = (competition: Competition, userTeam: Team, currentYear: number) => {
  switch (competition) {
    case 'LEAGUE':
      return `Campeonato Nacional - Divisão ${userTeam.division}`;
    case 'REGIONAL':
      return userTeam.continent === 'SA'
        ? `Campeonato Estadual (${userTeam.state})`
        : `Copa Regional (${userTeam.country})`;
    case 'NATIONAL_CUP':
      return userTeam.continent === 'SA' ? 'Copa Nacional' : `Copa Nacional (${userTeam.country})`;
    case 'CONTINENTAL':
      return userTeam.continent === 'SA' ? 'Continental da América do Sul' : 'Continental da Europa';
    case 'WORLD_CUP':
      return currentYear % 4 === 0 ? `Copa do Mundo ${currentYear}` : `Copa do Mundo (${currentYear} sem edição)`;
    case 'OLYMPICS':
      return currentYear % 4 === 0 ? `Olimpíadas ${currentYear}` : `Olimpíadas (${currentYear} sem edição)`;
    default:
      return '';
  }
};

const getInternationalEditionYear = (competition: Competition, matches: Match[], currentYear: number) => {
  const competitionMatches = matches.filter(match => match.competition === competition);
  if (competitionMatches.length > 0) return competitionMatches[0].seasonYear ?? currentYear;
  return currentYear % 4 === 0 ? currentYear : null;
};

const getCompetitionSquad = (team: Team, competition: Competition) =>
  team.competitionSquads?.[competition]?.length ? team.competitionSquads[competition]! : team.players;

const buildGroupTables = (competitionMatches: Match[], teams: Team[]) => {
  const groupNames = [...new Set(competitionMatches.map(match => match.groupName).filter(Boolean))];

  return groupNames.map(groupName => {
    const groupMatches = competitionMatches.filter(match => match.groupName === groupName);
    const groupTeamIds = [...new Set(groupMatches.flatMap(match => [match.homeTeamId, match.awayTeamId]))];
    const groupTeams = groupTeamIds
      .map(teamId => teams.find(team => team.id === teamId))
      .filter((team): team is Team => Boolean(team));

    const table = groupTeams.map(team => {
      const playedMatches = groupMatches.filter(
        match => match.played && (match.homeTeamId === team.id || match.awayTeamId === team.id),
      );
      const goalsFor = playedMatches.reduce(
        (sum, match) => sum + (match.homeTeamId === team.id ? match.homeScore : match.awayScore),
        0,
      );
      const goalsAgainst = playedMatches.reduce(
        (sum, match) => sum + (match.homeTeamId === team.id ? match.awayScore : match.homeScore),
        0,
      );
      const points = playedMatches.reduce((sum, match) => {
        const teamScore = match.homeTeamId === team.id ? match.homeScore : match.awayScore;
        const opponentScore = match.homeTeamId === team.id ? match.awayScore : match.homeScore;
        if (teamScore > opponentScore) return sum + 3;
        if (teamScore === opponentScore) return sum + 1;
        return sum;
      }, 0);
      const fairPlay = playedMatches.reduce(
        (sum, match) =>
          sum +
          match.events.reduce((eventSum, event) => {
            if (event.teamId !== team.id) return eventSum;
            if (event.type === 'YELLOW_CARD') return eventSum + 1;
            if (event.type === 'RED_CARD') return eventSum + 3;
            return eventSum;
          }, 0),
        0,
      );

      return {
        team,
        points,
        played: playedMatches.length,
        goalsFor,
        goalsAgainst,
        fairPlay,
      };
    });

    return {
      groupName,
      table: table.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const gdA = a.goalsFor - a.goalsAgainst;
        const gdB = b.goalsFor - b.goalsAgainst;
        if (gdB !== gdA) return gdB - gdA;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        if (a.fairPlay !== b.fairPlay) return a.fairPlay - b.fairPlay;
        return b.team.overall - a.team.overall;
      }),
    };
  });
};

const getTopScorers = (participants: Team[], competition: Competition) =>
  participants
    .flatMap(team =>
      getCompetitionSquad(team, competition).map(player => ({
        ...player,
        nationalTeamName: team.name,
      })),
    )
    .filter(player => (player.nationalGoals ?? 0) > 0 || player.goals > 0)
    .sort((a, b) => {
      const goalDelta = (b.nationalGoals ?? b.goals ?? 0) - (a.nationalGoals ?? a.goals ?? 0);
      if (goalDelta !== 0) return goalDelta;
      return (b.nationalCaps ?? 0) - (a.nationalCaps ?? 0);
    })
    .slice(0, 10);

function InternationalCompetitionPanel({
  competition,
  title,
  onViewSquad,
}: {
  competition: Competition;
  title: string;
  onViewSquad?: (teamId: string, competition?: 'ALL' | Competition) => void;
}) {
  const { teams, matches, currentYear = 2026, competitionHistory } = useGameStore();
  const competitionMatches = matches.filter(match => match.competition === competition);
  const participatingTeamIds = new Set(competitionMatches.flatMap(match => [match.homeTeamId, match.awayTeamId]));
  const participants = teams.filter(team => participatingTeamIds.has(team.id));
  const editionYear = getInternationalEditionYear(competition, matches, currentYear);
  const groupTables = useMemo(() => buildGroupTables(competitionMatches, teams), [competitionMatches, teams]);
  const knockoutStages = useMemo(() => {
    const grouped = new Map<string, Match[]>();

    competitionMatches
      .filter(match => match.isKnockout)
      .forEach(match => {
        const stage = match.stage || 'Mata-mata';
        if (!grouped.has(stage)) grouped.set(stage, []);
        grouped.get(stage)!.push(match);
      });

    return [...grouped.entries()].sort(
      ([, stageMatchesA], [, stageMatchesB]) =>
        (stageMatchesB[0]?.roundSize ?? 0) - (stageMatchesA[0]?.roundSize ?? 0),
    );
  }, [competitionMatches]);
  const topScorers = getTopScorers(participants, competition);
  const history = [...(competitionHistory?.[competition] ?? [])].sort((a, b) => b.year - a.year);

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-100">{title}</h2>
            <p className="text-sm text-slate-400">
              {editionYear
                ? `Edição atual: ${editionYear}. Formato: fase de grupos + mata-mata.`
                : `Não há edição ativa em ${currentYear}.`}
            </p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
            Seleções participantes: <span className="font-bold text-slate-100">{participants.length}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="border-b border-slate-700 bg-slate-900/60 px-6 py-4">
            <h3 className="font-semibold text-slate-100">Fase de grupos</h3>
          </div>
          <div className="p-6 space-y-6">
            {groupTables.length > 0 ? (
              groupTables.map(group => (
                <div key={group.groupName} className="space-y-3">
                  <p className="text-sm font-bold uppercase tracking-wide text-emerald-400">{group.groupName}</p>
                  <div className="overflow-x-auto rounded-xl border border-slate-700">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-900/70 text-slate-400">
                        <tr>
                          <th className="px-4 py-3 text-center">Pos</th>
                          <th className="px-4 py-3">Seleção</th>
                          <th className="px-4 py-3 text-center">P</th>
                          <th className="px-4 py-3 text-center">J</th>
                          <th className="px-4 py-3 text-center">GP</th>
                          <th className="px-4 py-3 text-center">GC</th>
                          <th className="px-4 py-3 text-center">FP</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700/50">
                        {group.table.map((entry, index) => (
                          <tr key={entry.team.id} className={index < 2 ? 'bg-emerald-900/10' : ''}>
                            <td className="px-4 py-3 text-center text-slate-400">{formatOrdinal(index + 1)}</td>
                            <td className="px-4 py-3 font-medium text-slate-200">
                              <span className="inline-flex items-center gap-2">
                                <TeamFlag country={entry.team.country} teamName={entry.team.name} size="xs" />
                                <span>{entry.team.name}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-emerald-400">{entry.points}</td>
                            <td className="px-4 py-3 text-center text-slate-300">{entry.played}</td>
                            <td className="px-4 py-3 text-center text-slate-300">{entry.goalsFor}</td>
                            <td className="px-4 py-3 text-center text-slate-300">{entry.goalsAgainst}</td>
                            <td className="px-4 py-3 text-center text-slate-300">{entry.fairPlay}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Os grupos aparecerão quando a competição começar.</p>
            )}
          </div>
        </div>

        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="border-b border-slate-700 bg-slate-900/60 px-6 py-4">
            <h3 className="font-semibold text-slate-100">Mata-mata / Resultados</h3>
          </div>
          <div className="p-6 space-y-5">
            {knockoutStages.length > 0 ? (
              knockoutStages.map(([stage, stageMatches]) => (
                <div key={stage} className="space-y-3">
                  <p className="text-sm font-bold uppercase tracking-wide text-emerald-400">{stage}</p>
                  {stageMatches.map(match => {
                    const home = teams.find(team => team.id === match.homeTeamId);
                    const away = teams.find(team => team.id === match.awayTeamId);
                    if (!home || !away) return null;

                    return (
                      <div key={match.id} className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-3">
                        <div className="flex items-center justify-between gap-4">
                          <span className="inline-flex items-center gap-2 font-medium text-slate-200">
                            <TeamFlag country={home.country} teamName={home.name} size="xs" />
                            <span>{home.name}</span>
                          </span>
                          <span className="font-mono font-bold text-white">
                            {match.played ? `${match.homeScore} - ${match.awayScore}` : 'vs'}
                          </span>
                          <span className="inline-flex items-center gap-2 font-medium text-slate-200">
                            <TeamFlag country={away.country} teamName={away.name} size="xs" />
                            <span>{away.name}</span>
                          </span>
                        </div>
                        {match.played && match.wentToPenalties && (
                          <p className="mt-2 text-xs text-amber-400">Decidido nos pênaltis</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">O mata-mata aparecerá quando a fase de grupos terminar.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="border-b border-slate-700 bg-slate-900/60 px-6 py-4">
            <h3 className="font-semibold text-slate-100">Artilheiros</h3>
          </div>
          <div className="p-6 space-y-3">
            {topScorers.length > 0 ? (
              topScorers.map((player, index) => (
                <div key={player.id} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-slate-200">
                      {formatOrdinal(index + 1)} {player.name}
                    </p>
                    <p className="inline-flex items-center gap-2 text-xs text-slate-400">
                      <TeamFlag
                        country={participants.find(team => team.name === player.nationalTeamName)?.country}
                        teamName={player.nationalTeamName}
                        size="xs"
                      />
                      <span>{player.nationalTeamName}</span>
                    </p>
                  </div>
                  <span className="font-bold text-emerald-400">{player.nationalGoals ?? player.goals}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Nenhum gol internacional registrado ainda.</p>
            )}
          </div>
        </div>

        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="border-b border-slate-700 bg-slate-900/60 px-6 py-4">
            <h3 className="font-semibold text-slate-100">Histórico de campeões</h3>
          </div>
          <div className="p-6 space-y-3">
            {history.length > 0 ? (
              history.map(entry => (
                <div key={`${entry.year}-${entry.championTeamId}`} className="flex items-center justify-between gap-4">
                  <span className="text-slate-300">{entry.year}</span>
                  <span className="inline-flex items-center gap-2 font-medium text-slate-100">
                    <TeamFlag
                      country={teams.find(team => team.id === entry.championTeamId)?.country}
                      teamName={entry.championName}
                      size="xs"
                    />
                    <span>{entry.championName}</span>
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">Nenhum campeão registrado ainda.</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
        <div className="border-b border-slate-700 bg-slate-900/60 px-6 py-4">
          <h3 className="font-semibold text-slate-100">Convocações atuais</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-2">
          {participants.length > 0 ? (
            participants.map(team => {
              const calledPlayers = [...getCompetitionSquad(team, competition)].sort((a, b) => b.overall - a.overall);

              return (
                <div key={team.id} className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="inline-flex items-center gap-2 font-semibold text-slate-100">
                        <TeamFlag country={team.country} teamName={team.name} size="xs" />
                        <span>{team.name}</span>
                      </p>
                      <p className="text-xs text-slate-400">{calledPlayers.length} convocados</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400">
                        {team.country}
                      </span>
                      {onViewSquad && (
                        <button
                          type="button"
                          onClick={() => onViewSquad(team.id, competition)}
                          className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-1.5 text-xs font-bold text-emerald-400 transition hover:border-emerald-500"
                        >
                          Ver plantel
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {calledPlayers.slice(0, 6).map(player => {
                      const club = findPlayerClub(teams, player.id);
                      return (
                        <div key={player.id} className="flex items-center justify-between gap-4 text-sm">
                          <div className="min-w-0">
                            <p className="truncate text-slate-300">{player.name}</p>
                            <p className="inline-flex items-center gap-1.5 truncate text-xs text-slate-500">
                              {club ? (
                                <>
                                  <TeamFlag country={club.country} teamName={club.name} size="xs" />
                                  <span>{club.name}</span>
                                </>
                              ) : (
                                <span>Sem clube</span>
                              )}
                            </p>
                          </div>
                          <span className="shrink-0 text-slate-400">
                            {player.position} · {player.overall}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-slate-400">
              As convocações aparecerão quando houver uma edição ativa dessa competição.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function Standings({
  onViewSquad,
}: {
  onViewSquad?: (teamId: string, competition?: 'ALL' | Competition) => void;
}) {
  const { teams, matches, userTeamId, currentYear = 2026 } = useGameStore();
  const userTeam = teams.find(team => team.id === userTeamId);
  const [activeComp, setActiveComp] = useState<Competition>('LEAGUE');

  if (!userTeam) return null;

  const title = getCompetitionTitle(activeComp, userTeam, currentYear);
  const isInternationalTab = INTERNATIONAL_COMPETITIONS.includes(activeComp);
  const competitionTabs = [...DOMESTIC_TABS, ...INTERNATIONAL_TABS];

  let displayTeams: Team[] = [];

  if (activeComp === 'LEAGUE') {
    displayTeams = teams.filter(
      team => team.division > 0 && team.country === userTeam.country && team.division === userTeam.division,
    );
  } else if (activeComp === 'REGIONAL') {
    displayTeams = teams.filter(
      team => team.division > 0 && team.country === userTeam.country && team.state === userTeam.state,
    );
  } else if (activeComp === 'NATIONAL_CUP') {
    displayTeams = teams.filter(team => team.division > 0 && team.country === userTeam.country);
  } else if (activeComp === 'CONTINENTAL') {
    displayTeams = teams.filter(
      team =>
        team.division === 1 &&
        matches.some(match => match.competition === 'CONTINENTAL' && (match.homeTeamId === team.id || match.awayTeamId === team.id)),
    );
  }

  const sortedTeams = sortTeamsByCompetitionTable(displayTeams, activeComp, matches);

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-100">Competições</h1>
        <p className="mt-1 text-slate-400">
          Acompanhe o desempenho do seu time e das seleções ao longo da temporada.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-px">
        {competitionTabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveComp(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeComp === tab.id
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200',
              )}
            >
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {isInternationalTab ? (
        <InternationalCompetitionPanel competition={activeComp} title={title} onViewSquad={onViewSquad} />
      ) : (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
          <div className="p-4 bg-slate-900/50 border-b border-slate-700">
            <h2 className="font-bold text-slate-200">{title}</h2>
            {activeComp === 'CONTINENTAL' && sortedTeams.length === 0 && (
              <p className="mt-1 text-sm text-slate-400">
                O torneio continental começa vazio e só é criado após o término das competições domésticas.
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="px-6 py-4 font-medium w-16 text-center">Pos</th>
                  <th className="px-6 py-4 font-medium">Clube</th>
                  <th className="px-4 py-4 font-medium text-center">P</th>
                  <th className="px-4 py-4 font-medium text-center">J</th>
                  <th className="px-4 py-4 font-medium text-center">V</th>
                  <th className="px-4 py-4 font-medium text-center">E</th>
                  <th className="px-4 py-4 font-medium text-center">D</th>
                  <th className="px-4 py-4 font-medium text-center">GP</th>
                  <th className="px-4 py-4 font-medium text-center">GC</th>
                  <th className="px-4 py-4 font-medium text-center">SG</th>
                  {onViewSquad && <th className="px-4 py-4 font-medium text-center">Plantel</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {sortedTeams.map((team, index) => {
                  const stats = team.stats[activeComp];
                  return (
                    <tr
                      key={team.id}
                      className={cn(
                        'transition-colors',
                        team.id === userTeamId ? 'bg-emerald-900/20' : 'hover:bg-slate-700/30',
                      )}
                    >
                      <td className="px-6 py-3 text-center font-bold text-slate-500">{formatOrdinal(index + 1)}</td>
                      <td className="px-6 py-3 font-medium text-slate-200">
                        <div className="flex items-center gap-2">
                          <TeamFlag country={team.country} teamName={team.name} size="xs" />
                          <span>{team.name}</span>
                          {team.id === userTeamId && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              VOCÊ
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-emerald-400">
                        {stats.wins * 3 + stats.draws}
                      </td>
                      <td className="px-4 py-3 text-center text-slate-400">{stats.played}</td>
                      <td className="px-4 py-3 text-center text-slate-300">{stats.wins}</td>
                      <td className="px-4 py-3 text-center text-slate-300">{stats.draws}</td>
                      <td className="px-4 py-3 text-center text-slate-300">{stats.losses}</td>
                      <td className="px-4 py-3 text-center text-slate-400">{stats.goalsFor}</td>
                      <td className="px-4 py-3 text-center text-slate-400">{stats.goalsAgainst}</td>
                      <td className="px-4 py-3 text-center font-medium text-slate-300">
                        {stats.goalsFor - stats.goalsAgainst}
                      </td>
                      {onViewSquad && (
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => onViewSquad(team.id, activeComp)}
                            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-bold text-emerald-400 transition hover:border-emerald-500 hover:bg-slate-800"
                          >
                            Ver
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {sortedTeams.length === 0 && (
                  <tr>
                    <td colSpan={onViewSquad ? 11 : 10} className="px-6 py-10 text-center text-slate-500">
                      Nenhum clube listado para esta competição no momento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
