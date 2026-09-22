import {
  Competition,
  CompetitionHistoryEntry,
  GameState,
  Match,
  MatchEvent,
  NewsItem,
  Player,
  RetiredPlayerRecord,
  SeasonMovement,
  SeasonReview,
  Team,
  TeamStats,
  WeekSummary,
} from '../types/game';
import { sortTeamsByCompetitionTable } from '../game/engine';
import { ensureTeamCommercial } from '../game/commercial';
import { ensureTeamSponsors } from '../game/sponsorship';
import {
  createPlayerContract,
  ensureTeamAcademy,
  recalculatePlayerEconomics,
} from '../game/playerLifecycle';

export const DEFAULT_START_YEAR = 2026;
export const DEFAULT_BENCH_SIZE = 15;
export const YELLOW_SUSPENSION_THRESHOLD = 2;
export const CURRENT_SAVE_SCHEMA_VERSION = 2;

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const createDisciplinaryRecord = () => ({
  yellowCards: 0,
  redCards: 0,
  accumulatedYellows: 0,
  suspendedMatches: 0,
  matchesSuspended: 0,
});

export const getPlayerCompetitionRecord = (player: Player, competition: Competition) =>
  player.disciplinary?.[competition] ?? createDisciplinaryRecord();

export const setPlayerCompetitionRecord = (
  player: Player,
  competition: Competition,
  updater: (record: ReturnType<typeof createDisciplinaryRecord>) => ReturnType<typeof createDisciplinaryRecord>,
) => {
  const current = getPlayerCompetitionRecord(player, competition);
  player.disciplinary = {
    ...(player.disciplinary ?? {}),
    [competition]: updater({ ...current }),
  };
};

export const isPlayerSuspendedForCompetition = (player: Player, competition: Competition) =>
  getPlayerCompetitionRecord(normalizePlayer(player), competition).suspendedMatches > 0;

export const isPlayerInjured = (player: Player) => (player.injury?.weeksRemaining ?? 0) > 0;

export const isPlayerUnavailable = (player: Player, competitions: Competition[]) =>
  isPlayerInjured(player) || competitions.some(competition => isPlayerSuspendedForCompetition(player, competition));

export const getCompetitionPlayers = (team: Team, competition: Competition) =>
  team.competitionSquads?.[competition]?.length ? team.competitionSquads[competition]! : team.players;

export const normalizePlayer = (player: Player): Player => {
  const ratingSamples = player.ratingSamples ?? 0;
  const averageRating =
    player.averageRating ?? (ratingSamples > 0 ? (player.ratingTotal ?? 0) / ratingSamples : 0);

  const normalizedPlayer: Player = {
    ...player,
    seasonMinutes: player.seasonMinutes ?? player.matchesPlayed * 90,
    averageRating,
    ratingTotal: player.ratingTotal ?? averageRating * ratingSamples,
    ratingSamples,
    form: player.form ?? (averageRating || 6),
    nationalCaps: player.nationalCaps ?? 0,
    nationalGoals: player.nationalGoals ?? 0,
    nationalCallUpHistory: player.nationalCallUpHistory ?? [],
    nationalTournamentHistory: player.nationalTournamentHistory ?? [],
    yellowCardsSeason: player.yellowCardsSeason ?? player.yellowCards ?? 0,
    redCardsSeason: player.redCardsSeason ?? player.redCards ?? 0,
    disciplinary: player.disciplinary ?? {},
    potential: player.potential ?? clamp(player.overall + 6, player.overall, 99),
    status: player.status ?? 'ACTIVE',
    cleanSheets: player.cleanSheets ?? 0,
    saves: player.saves ?? 0,
    savePercentage: player.savePercentage ?? 0,
    keyPasses: player.keyPasses ?? 0,
    tackles: player.tackles ?? 0,
    interceptions: player.interceptions ?? 0,
    passAccuracy: player.passAccuracy ?? 0,
    titlesWon: player.titlesWon ?? 0,
    youthProspect: player.youthProspect ?? false,
    injury:
      player.injury && player.injury.weeksRemaining > 0
        ? {
            ...player.injury,
            weeksRemaining: Math.max(0, player.injury.weeksRemaining),
          }
        : null,
    contract: player.contract
      ? {
          ...player.contract,
          performanceGoals: [...player.contract.performanceGoals],
        }
      : undefined,
  };

  return normalizedPlayer.contract
    ? recalculatePlayerEconomics(normalizedPlayer, normalizedPlayer.contract.startYear)
    : recalculatePlayerEconomics(
        {
          ...normalizedPlayer,
          contract: createPlayerContract(normalizedPlayer, DEFAULT_START_YEAR),
        },
        DEFAULT_START_YEAR,
      );
};

const repairCompetitionStats = (stats: TeamStats): TeamStats => {
  const accounted = stats.wins + stats.losses + stats.draws;
  const draws =
    accounted > stats.played && stats.played > 0
      ? Math.max(0, stats.played - stats.wins - stats.losses)
      : stats.draws;

  return {
    ...stats,
    draws,
    points: stats.wins * 3 + draws,
  };
};

export const normalizeTeam = (team: Team, currentYear = DEFAULT_START_YEAR): Team => {
  const normalizedTeam: Team = {
    ...team,
    regionalDivision: team.regionalDivision ?? team.division,
    players: team.players.map(normalizePlayer),
    competitionSquads: team.competitionSquads
      ? Object.fromEntries(
          Object.entries(team.competitionSquads).map(([competition, players]) => [
            competition,
            (players ?? []).map(normalizePlayer),
          ]),
        ) as Team['competitionSquads']
      : undefined,
    sponsors: (team.sponsors ?? []).map(sponsor => ({ ...sponsor })),
    academyPlayers: (team.academyPlayers ?? []).map(normalizePlayer),
    stats: Object.fromEntries(
      Object.entries(team.stats).map(([competition, stats]) => [competition, repairCompetitionStats(stats)]),
    ) as Team['stats'],
  };

  return ensureTeamCommercial(ensureTeamAcademy(ensureTeamSponsors(normalizedTeam, currentYear), currentYear));
};

export const normalizeGameState = (state: GameState): GameState => ({
  ...state,
  schemaVersion: state.schemaVersion ?? CURRENT_SAVE_SCHEMA_VERSION,
  teams: state.teams.map(team => normalizeTeam(team, state.currentYear ?? DEFAULT_START_YEAR)),
  currentYear: state.currentYear ?? DEFAULT_START_YEAR,
  competitionHistory: state.competitionHistory ?? {},
  retiredPlayersHistory: state.retiredPlayersHistory ?? [],
  newsFeed: state.newsFeed ?? [],
  recentRoundSummary: state.recentRoundSummary ?? null,
  seasonReview: state.seasonReview ?? null,
});

export const cloneTeams = (teams: Team[]) =>
  teams.map(team => ({
    ...team,
    commercial: team.commercial
      ? {
          ...team.commercial,
          lastWeeklyReport: team.commercial.lastWeeklyReport ? { ...team.commercial.lastWeeklyReport } : null,
        }
      : undefined,
    players: team.players.map(player => ({ ...normalizePlayer(player) })),
    sponsors: (team.sponsors ?? []).map(sponsor => ({ ...sponsor })),
    academyPlayers: (team.academyPlayers ?? []).map(player => ({ ...normalizePlayer(player) })),
    competitionSquads: team.competitionSquads
      ? Object.fromEntries(
          Object.entries(team.competitionSquads).map(([competition, players]) => [
            competition,
            (players ?? []).map(player => ({ ...normalizePlayer(player) })),
          ]),
        ) as Team['competitionSquads']
      : undefined,
  }));

export const mutatePlayerAcrossTeams = (
  teams: Team[],
  playerId: string,
  mutator: (player: Player, team: Team) => void,
) => {
  teams.forEach(team => {
    const player = team.players.find(currentPlayer => currentPlayer.id === playerId);
    if (player) {
      mutator(player, team);
    }
  });
};

export const roundMoney = (value: number) => {
  if (value >= 1_000_000) return Math.round(value / 100_000) * 100_000;
  if (value >= 100_000) return Math.round(value / 10_000) * 10_000;
  return Math.round(value / 1_000) * 1_000;
};

export const getMinutesPlayedMap = (team: Team, teamEvents: MatchEvent[]) => {
  const minutes = new Map<string, number>();

  team.players
    .filter(player => player.isStarter)
    .forEach(player => {
      minutes.set(player.id, 90);
    });

  teamEvents
    .filter(event => event.type === 'SUBSTITUTION')
    .forEach(event => {
      if (event.assistPlayerId) {
        minutes.set(event.assistPlayerId, Math.min(minutes.get(event.assistPlayerId) ?? 90, event.minute));
      }

      minutes.set(event.playerId, Math.max(minutes.get(event.playerId) ?? 0, 90 - event.minute));
    });

  return minutes;
};

export const calculatePlayerRating = (
  playerId: string,
  teamScore: number,
  opponentScore: number,
  teamEvents: MatchEvent[],
  minutesPlayed: number,
) => {
  const goals = teamEvents.filter(event => event.type === 'GOAL' && event.playerId === playerId).length;
  const assists = teamEvents.filter(event => event.type === 'GOAL' && event.assistPlayerId === playerId).length;
  const yellowCards = teamEvents.filter(event => event.type === 'YELLOW_CARD' && event.playerId === playerId).length;
  const redCards = teamEvents.filter(event => event.type === 'RED_CARD' && event.playerId === playerId).length;

  let rating = 6;
  rating += goals * 1.6;
  rating += assists * 1.1;
  rating += minutesPlayed >= 60 ? 0.25 : minutesPlayed > 0 ? 0.1 : 0;
  rating += teamScore > opponentScore ? 0.4 : teamScore < opponentScore ? -0.3 : 0.1;
  rating -= yellowCards * 0.35;
  rating -= redCards * 1.2;

  return Number(clamp(rating, 4, 10).toFixed(2));
};

export const resolveKnockoutWinner = (home: Team, away: Team, result: { homeScore: number; awayScore: number }) => {
  if (result.homeScore > result.awayScore) {
    return { winnerTeamId: home.id, wentToPenalties: false };
  }

  if (result.awayScore > result.homeScore) {
    return { winnerTeamId: away.id, wentToPenalties: false };
  }

  const homeStrength = home.players.filter(player => player.isStarter).reduce((sum, player) => sum + player.overall, 0);
  const awayStrength = away.players.filter(player => player.isStarter).reduce((sum, player) => sum + player.overall, 0);
  const homeTieBreaker = homeStrength + home.historicalPoints / 1000 + 0.1;
  const awayTieBreaker = awayStrength + away.historicalPoints / 1000;

  return {
    winnerTeamId: homeTieBreaker >= awayTieBreaker ? home.id : away.id,
    wentToPenalties: true,
  };
};

const emptyCompetitionStats = (): TeamStats => ({
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  points: 0,
});

export const buildCompetitionStats = (): Record<Competition, TeamStats> => ({
  LEAGUE: emptyCompetitionStats(),
  REGIONAL: emptyCompetitionStats(),
  NATIONAL_CUP: emptyCompetitionStats(),
  CONTINENTAL: emptyCompetitionStats(),
  CONTINENTAL_SECONDARY: emptyCompetitionStats(),
  WORLD_CUP: emptyCompetitionStats(),
  OLYMPICS: emptyCompetitionStats(),
});

export const calculateTeamOverall = (players: Player[]) => {
  const starters = players.filter(player => player.isStarter);
  const source = starters.length > 0 ? starters : players.slice(0, 11);
  if (source.length === 0) return 0;
  return Math.round(source.reduce((sum, player) => sum + player.overall, 0) / source.length);
};

export const resetPlayerSeasonStats = (player: Player, resetCareer = false): Player => ({
  ...normalizePlayer(player),
  goals: 0,
  assists: 0,
  yellowCards: 0,
  redCards: 0,
  matchesPlayed: 0,
  seasonMinutes: 0,
  averageRating: 0,
  ratingTotal: 0,
  ratingSamples: 0,
  form: 6,
  careerGoals: resetCareer ? 0 : player.careerGoals,
  careerAssists: resetCareer ? 0 : player.careerAssists,
  careerMatches: resetCareer ? 0 : player.careerMatches,
  yellowCardsSeason: 0,
  redCardsSeason: 0,
  disciplinary: {},
  cleanSheets: 0,
  saves: 0,
  savePercentage: 0,
  keyPasses: 0,
  tackles: 0,
  interceptions: 0,
  passAccuracy: 0,
  youthProspect: resetCareer ? true : player.youthProspect,
  injury: null,
});

export const cloneCompetitionHistory = (
  history: GameState['competitionHistory'],
): Partial<Record<Competition, CompetitionHistoryEntry[]>> => {
  const entries = history ?? {};
  return Object.fromEntries(
    Object.entries(entries).map(([competition, items]) => [competition, [...(items ?? [])]]),
  ) as Partial<Record<Competition, CompetitionHistoryEntry[]>>;
};

export const recordCompetitionChampion = (
  history: Partial<Record<Competition, CompetitionHistoryEntry[]>>,
  competition: Competition,
  champion: CompetitionHistoryEntry,
) => {
  const currentEntries = history[competition] ?? [];
  const exists = currentEntries.some(
    entry => entry.year === champion.year && entry.championTeamId === champion.championTeamId,
  );
  if (!exists) {
    history[competition] = [...currentEntries, champion];
  }
};

export const getRegionalDivisionForTeam = (team: Team, division = team.division) => {
  if (division <= 0) return 0;
  if (team.country === 'BR') return division <= 2 ? 1 : 2;
  return division;
};

export const getPromotionSlots = (teamCount: number) => {
  if (teamCount >= 18) return 4;
  if (teamCount >= 10) return 2;
  if (teamCount >= 6) return 1;
  return 0;
};

export const applyPromotionAndRelegation = (teams: Team[], matches: Match[]) => {
  const updatedTeams = teams.map(team => ({
    ...team,
    regionalDivision: getRegionalDivisionForTeam(team),
  }));
  const byId = new Map(updatedTeams.map(team => [team.id, team]));
  const countries = [...new Set(updatedTeams.map(team => team.country))];

  countries.forEach(country => {
    const originalCountryTeams = teams.filter(team => team.country === country && team.division > 0);
    const maxDivision = Math.max(...originalCountryTeams.map(team => team.division), 0);

    for (let division = 1; division < maxDivision; division += 1) {
      const currentDivisionTeams = originalCountryTeams.filter(team => team.division === division);
      const lowerDivisionTeams = originalCountryTeams.filter(team => team.division === division + 1);
      if (currentDivisionTeams.length < 2 || lowerDivisionTeams.length < 2) continue;

      const slots = Math.min(
        getPromotionSlots(currentDivisionTeams.length),
        getPromotionSlots(lowerDivisionTeams.length),
      );
      if (slots <= 0) continue;

      const relegated = sortTeamsByCompetitionTable(currentDivisionTeams, 'LEAGUE', matches).slice(-slots);
      const promoted = sortTeamsByCompetitionTable(lowerDivisionTeams, 'LEAGUE', matches).slice(0, slots);

      relegated.forEach(team => {
        const current = byId.get(team.id);
        if (!current) return;
        current.division = division + 1;
        current.regionalDivision = getRegionalDivisionForTeam(current, current.division);
      });

      promoted.forEach(team => {
        const current = byId.get(team.id);
        if (!current) return;
        current.division = division;
        current.regionalDivision = getRegionalDivisionForTeam(current, current.division);
      });
    }
  });

  return updatedTeams;
};

export const createNewsItem = (
  type: NewsItem['type'],
  title: string,
  body: string,
  week: number,
  year: number,
  options: Partial<Pick<NewsItem, 'teamId' | 'playerId'>> = {},
): NewsItem => ({
  id: Math.random().toString(36).slice(2, 11),
  type,
  title,
  body,
  week,
  year,
  teamId: options.teamId,
  playerId: options.playerId,
  createdAt: Date.now() + Math.floor(Math.random() * 1000),
});

export const appendNewsFeed = (existing: NewsItem[] | undefined, entries: NewsItem[]) =>
  [...entries, ...(existing ?? [])]
    .sort((itemA, itemB) => itemB.createdAt - itemA.createdAt)
    .slice(0, 40);

export const decrementPlayerInjuries = (teams: Team[]) =>
  teams.map(team => ({
    ...team,
    players: team.players.map(player => {
      if (!player.injury || player.injury.weeksRemaining <= 0) {
        return player;
      }

      const remaining = player.injury.weeksRemaining - 1;
      return {
        ...player,
        injury:
          remaining > 0
            ? {
                ...player.injury,
                weeksRemaining: remaining,
              }
            : null,
      };
    }),
    academyPlayers: (team.academyPlayers ?? []).map(player => {
      if (!player.injury || player.injury.weeksRemaining <= 0) {
        return player;
      }

      const remaining = player.injury.weeksRemaining - 1;
      return {
        ...player,
        injury:
          remaining > 0
            ? {
                ...player.injury,
                weeksRemaining: remaining,
              }
            : null,
      };
    }),
  }));

export const enforceAvailableLineup = (team: Team, competitions: Competition[]) => {
  const availablePlayers = team.players.filter(player => !isPlayerUnavailable(player, competitions));
  const preferredStarters = availablePlayers.filter(player => player.isStarter);

  team.players.forEach(player => {
    if (isPlayerUnavailable(player, competitions)) {
      player.isStarter = false;
    }
  });

  const pickByPosition = (position: Player['position'], limit: number, pool: Player[], selectedIds: Set<string>) => {
    pool
      .filter(player => player.position === position && !selectedIds.has(player.id))
      .sort((playerA, playerB) => {
        const scoreA = playerA.overall * (0.6 + playerA.energy / 250);
        const scoreB = playerB.overall * (0.6 + playerB.energy / 250);
        return scoreB - scoreA;
      })
      .slice(0, limit)
      .forEach(player => {
        selectedIds.add(player.id);
      });
  };

  const selectedIds = new Set<string>();
  const preferredByPosition = (position: Player['position']) => preferredStarters.filter(player => player.position === position);

  preferredByPosition('GK').slice(0, 1).forEach(player => selectedIds.add(player.id));
  preferredByPosition('DEF').slice(0, 4).forEach(player => selectedIds.add(player.id));
  preferredByPosition('MID').slice(0, 4).forEach(player => selectedIds.add(player.id));
  preferredByPosition('ATK').slice(0, 2).forEach(player => selectedIds.add(player.id));

  pickByPosition('GK', Math.max(0, 1 - preferredByPosition('GK').length), availablePlayers, selectedIds);
  pickByPosition('DEF', Math.max(0, 4 - preferredByPosition('DEF').length), availablePlayers, selectedIds);
  pickByPosition('MID', Math.max(0, 4 - preferredByPosition('MID').length), availablePlayers, selectedIds);
  pickByPosition('ATK', Math.max(0, 2 - preferredByPosition('ATK').length), availablePlayers, selectedIds);

  availablePlayers
    .filter(player => !selectedIds.has(player.id))
    .sort((playerA, playerB) => {
      const scoreA = playerA.overall * (0.6 + playerA.energy / 250);
      const scoreB = playerB.overall * (0.6 + playerB.energy / 250);
      return scoreB - scoreA;
    })
    .forEach(player => {
      if (selectedIds.size < 11) {
        selectedIds.add(player.id);
      }
    });

  team.players.forEach(player => {
    player.isStarter = selectedIds.has(player.id);
  });
};

export const getNegotiatedMarketValue = (player: Player, currentYear: number, direction: 'buy' | 'sell') => {
  const contractYearsLeft = player.contract ? Math.max(0, player.contract.endYear - currentYear) : 1;
  const formModifier = (player.form ?? 6) >= 7.2 ? 0.1 : (player.form ?? 6) <= 5.8 ? -0.08 : 0;
  const ageModifier = player.age <= 23 ? 0.12 : player.age >= 31 ? -0.12 : 0;
  const requestModifier = player.contract?.requestedTransfer ? -0.08 : player.contract?.requestedSalaryIncrease ? 0.06 : 0;
  const contractModifier = contractYearsLeft >= 3 ? 0.08 : contractYearsLeft === 0 ? -0.12 : 0;
  const marketMultiplier =
    direction === 'buy'
      ? clamp(1.02 + formModifier + ageModifier + contractModifier + requestModifier, 0.82, 1.35)
      : clamp(0.9 + formModifier + ageModifier + contractModifier + requestModifier, 0.72, 1.18);

  return roundMoney(player.value * marketMultiplier);
};

export const buildSeasonReview = (teams: Team[], matches: Match[], year: number): SeasonReview => {
  const leagueTeams = teams.filter(team => team.division > 0);
  const countries = [...new Set(leagueTeams.map(team => team.country))];
  const movements: SeasonMovement[] = [];
  const leagueChampions: SeasonReview['leagueChampions'] = [];

  countries.forEach(country => {
    const countryTeams = leagueTeams.filter(team => team.country === country);
    const maxDivision = Math.max(...countryTeams.map(team => team.division), 0);

    for (let division = 1; division <= maxDivision; division += 1) {
      const divisionTeams = countryTeams.filter(team => team.division === division);
      if (divisionTeams.length === 0) continue;

      const ordered = sortTeamsByCompetitionTable(divisionTeams, 'LEAGUE', matches);
      const champion = ordered[0];
      if (champion) {
        leagueChampions.push({
          country,
          division,
          teamId: champion.id,
          teamName: champion.name,
        });
      }

      if (division === maxDivision) continue;

      const lowerDivisionTeams = countryTeams.filter(team => team.division === division + 1);
      if (divisionTeams.length < 2 || lowerDivisionTeams.length < 2) continue;

      const slots = Math.min(getPromotionSlots(divisionTeams.length), getPromotionSlots(lowerDivisionTeams.length));
      if (slots <= 0) continue;

      ordered.slice(-slots).forEach(team => {
        movements.push({
          country,
          teamId: team.id,
          teamName: team.name,
          fromDivision: division,
          toDivision: division + 1,
        });
      });

      sortTeamsByCompetitionTable(lowerDivisionTeams, 'LEAGUE', matches)
        .slice(0, slots)
        .forEach(team => {
          movements.push({
            country,
            teamId: team.id,
            teamName: team.name,
            fromDivision: division + 1,
            toDivision: division,
          });
        });
    }
  });

  return {
    year,
    leagueChampions,
    promoted: movements.filter(movement => movement.toDivision < movement.fromDivision),
    relegated: movements.filter(movement => movement.toDivision > movement.fromDivision),
  };
};

export const buildWeekSummary = (
  week: number,
  year: number,
  weekMatches: Match[],
  teams: Team[],
  userEntityIds: Set<string>,
): WeekSummary => {
  const userResults = weekMatches
    .filter(match => userEntityIds.has(match.homeTeamId) || userEntityIds.has(match.awayTeamId))
    .map(match => ({
      matchId: match.id,
      competition: match.competition,
      homeTeamName: teams.find(team => team.id === match.homeTeamId)?.name ?? 'Casa',
      awayTeamName: teams.find(team => team.id === match.awayTeamId)?.name ?? 'Fora',
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      userControlledTeamName:
        teams.find(team => userEntityIds.has(team.id) && (team.id === match.homeTeamId || team.id === match.awayTeamId))?.name ??
        undefined,
    }));

  const goalsInWeek = weekMatches.reduce((total, match) => total + match.homeScore + match.awayScore, 0);
  const headlines = [
    `${weekMatches.length} jogo(s) concluido(s) na semana ${week}.`,
    `${goalsInWeek} gol(s) marcados ao longo da rodada.`,
  ];

  return {
    week,
    year,
    hiddenMatchesCount: Math.max(0, weekMatches.length - userResults.length),
    userResults,
    headlines,
  };
};
