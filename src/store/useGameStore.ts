import { create } from 'zustand';
import {
  Competition,
  CompetitionHistoryEntry,
  GameState,
  Team,
  Player,
  Match,
  GameMode,
  MatchEvent,
  TeamStats,
  RetiredPlayerRecord,
  NewsItem,
  WeekSummary,
  SeasonReview,
  SeasonMovement,
} from '../types/game';
import { generateTeams, generateNationalTeams } from '../game/generator';
import {
  advanceKnockoutTournaments,
  advanceInternationalGroupTournaments,
  generateContinentalCompetitions,
  generateSchedule,
  getInternationalCompetitionsForYear,
  simulateMatch,
  sortTeamsByCompetitionTable,
} from '../game/engine';
import { ensureTeamSponsors, refreshSponsorsForNewSeason } from '../game/sponsorship';
import {
  autoPromoteAcademyPlayers,
  createPlayerContract,
  createRetiredPlayerRecord,
  createRegenPlayer,
  ensureTeamAcademy,
  getPlayerRetirementRisk,
  recalculatePlayerEconomics,
  refreshContractForNewSeason,
  refreshTeamAcademyForNewSeason,
  shouldPlayerRetire,
} from '../game/playerLifecycle';
import { ensureTeamCommercial, estimateMatchdayAttendance, estimateWeeklyCommercialRevenue } from '../game/commercial';

import {
  appendNewsFeed,
  applyPromotionAndRelegation,
  buildCompetitionStats,
  buildSeasonReview,
  buildWeekSummary,
  calculatePlayerRating,
  calculateTeamOverall,
  clamp,
  cloneCompetitionHistory,
  cloneTeams,
  createNewsItem,
  CURRENT_SAVE_SCHEMA_VERSION,
  decrementPlayerInjuries,
  DEFAULT_BENCH_SIZE,
  DEFAULT_START_YEAR,
  enforceAvailableLineup,
  getCompetitionPlayers,
  getMinutesPlayedMap,
  getNegotiatedMarketValue,
  getPlayerCompetitionRecord,
  getRegionalDivisionForTeam,
  isPlayerInjured,
  isPlayerSuspendedForCompetition,
  mutatePlayerAcrossTeams,
  normalizeGameState,
  normalizePlayer,
  normalizeTeam,
  recordCompetitionChampion,
  resetPlayerSeasonStats,
  resolveKnockoutWinner,
  roundMoney,
  setPlayerCompetitionRecord,
  YELLOW_SUSPENSION_THRESHOLD,
} from './gameStateHelpers';

interface GameStore extends GameState {
  startNewGame: (name: string, mode: GameMode, teamName?: string, playerDetails?: Partial<Player>) => void;
  playWeek: (
    userMatchResult?:
      | { matchId: string, homeScore: number, awayScore: number, events: MatchEvent[] }
      | Array<{ matchId: string, homeScore: number, awayScore: number, events: MatchEvent[] }>
  ) => void;
  updateLineup: (teamId: string, starters: string[]) => void;
  toggleStarter: (playerId: string) => void;
  setGameState: (state: GameState) => void;
  resetGame: () => void;
  generateMarket: () => void;
  buyPlayer: (playerId: string) => void;
  sellPlayer: (playerId: string) => void;
  distributePrizeMoney: () => void;
  upgradeStadium: (type: 'capacity' | 'food' | 'merch' | 'build') => void;
  updateClubPrice: (field: 'ticketPrice' | 'shirtPrice' | 'accessoryPrice' | 'membershipPrice' | 'digitalPrice', value: number) => void;
  trainPlayer: () => { success: boolean, improved: boolean, message: string } | undefined;
  generateJobOffers: () => void;
  acceptJobOffer: (teamId: string) => void;
  generatePlayerOffers: () => void;
  acceptPlayerOffer: (teamId: string) => void;
  renewPlayerContract: (playerId: string) => void;
  releasePlayer: (playerId: string) => void;
  promoteAcademyPlayer: (playerId: string) => void;
  requestPlayerTransfer: () => void;
  retireUserPlayer: () => void;
  nextSeason: () => void;
}

const initialState: GameState = {
  teams: [],
  matches: [],
  currentWeek: 1,
  schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
  userTeamId: null,
  userPlayerId: null,
  gameMode: null,
  isGameOver: false,
  marketPlayers: [],
  activeMatchId: null,
  managerReputation: 10,
  jobOffers: [],
  currentYear: DEFAULT_START_YEAR,
  competitionHistory: {},
  retiredPlayersHistory: [],
  newsFeed: [],
  recentRoundSummary: null,
  seasonReview: null,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  setGameState: (state) => set(normalizeGameState(state)),

  resetGame: () => set(initialState),

  generateMarket: () => {
    const { teams, currentYear = DEFAULT_START_YEAR } = get();
    const market: Player[] = [];

    teams.forEach(team => {
      if (!team.isUserControlled) {
        const availablePool = team.players.filter(
          player =>
            !player.injury &&
            (
              player.contract?.requestedTransfer ||
              player.contract?.endYear === currentYear ||
              (!player.isStarter && Math.random() > 0.72)
            ),
        );

        availablePool
          .sort((playerA, playerB) => getNegotiatedMarketValue(playerB, currentYear, 'buy') - getNegotiatedMarketValue(playerA, currentYear, 'buy'))
          .slice(0, Math.max(1, Math.min(4, availablePool.length)))
          .forEach(player => {
            market.push({ ...player });
          });
      }
    });

    set({
      marketPlayers: market.sort(
        (playerA, playerB) => getNegotiatedMarketValue(playerB, currentYear, 'buy') - getNegotiatedMarketValue(playerA, currentYear, 'buy'),
      ),
    });
  },

  buyPlayer: (playerId) => {
    const { teams, userTeamId, marketPlayers, currentYear = DEFAULT_START_YEAR, newsFeed = [], currentWeek } = get();
    if (!userTeamId) return;

    const userTeam = teams.find(t => t.id === userTeamId);
    if (!userTeam) return;

    const playerToBuy = marketPlayers.find(p => p.id === playerId);
    if (!playerToBuy) return;

    const askingPrice = getNegotiatedMarketValue(playerToBuy, currentYear, 'buy');

    if (userTeam.finances >= askingPrice) {
      set(state => ({
        teams: state.teams.map(team => {
          if (team.id === userTeamId) {
            return {
              ...team,
              finances: team.finances - askingPrice,
              players: [
                ...team.players,
                {
                  ...playerToBuy,
                  isStarter: false,
                  contract: playerToBuy.contract
                    ? {
                        ...playerToBuy.contract,
                        requestedTransfer: false,
                      }
                    : playerToBuy.contract,
                },
              ]
            };
          }
          // Remove from original team
          if (team.players.some(p => p.id === playerId)) {
            return {
              ...team,
              finances: team.finances + askingPrice,
              players: team.players.filter(p => p.id !== playerId)
            };
          }
          return team;
        }),
        marketPlayers: state.marketPlayers.filter(p => p.id !== playerId),
        newsFeed: appendNewsFeed(newsFeed, [
          createNewsItem(
            'TRANSFER',
            'Reforco confirmado',
            `${playerToBuy.name} assinou com ${userTeam.name} por ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(askingPrice)}.`,
            currentWeek,
            currentYear,
            { teamId: userTeam.id, playerId: playerToBuy.id },
          ),
        ]),
      }));
    }
  },

  sellPlayer: (playerId) => {
    const { teams, userTeamId, currentYear = DEFAULT_START_YEAR, newsFeed = [], currentWeek } = get();
    if (!userTeamId) return;

    const userTeam = teams.find(t => t.id === userTeamId);
    if (!userTeam) return;

    const playerToSell = userTeam.players.find(p => p.id === playerId);
    if (!playerToSell) return;
    const saleValue = getNegotiatedMarketValue(playerToSell, currentYear, 'sell');

    set(state => ({
      teams: state.teams.map(team => {
        if (team.id === userTeamId) {
          return {
            ...team,
            finances: team.finances + saleValue,
            players: team.players.filter(p => p.id !== playerId)
          };
        }
        return team;
      }),
      marketPlayers: [...state.marketPlayers, { ...playerToSell, isStarter: false }],
      newsFeed: appendNewsFeed(newsFeed, [
        createNewsItem(
          'TRANSFER',
          'Saida confirmada',
          `${playerToSell.name} deixou ${userTeam.name} por ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(saleValue)}.`,
          currentWeek,
          currentYear,
          { teamId: userTeam.id, playerId: playerToSell.id },
        ),
      ]),
    }));
  },

  startNewGame: (name, mode, teamName, playerDetails) => {
    const teams = generateTeams();
    const currentYear = DEFAULT_START_YEAR;
    const internationalCompetitions = getInternationalCompetitionsForYear(currentYear);
    const domesticTeams = teams.filter(team => team.division > 0);
    let userTeamId = null;
    let userPlayerId = null;

    if (mode === 'manager') {
      const userTeam =
        (teamName ? teams.find(t => t.name === teamName) : null) ??
        (domesticTeams.length > 0
          ? domesticTeams[Math.floor(Math.random() * domesticTeams.length)]
          : null);
      if (userTeam) {
        userTeam.isUserControlled = true;
        userTeamId = userTeam.id;
      }
    } else if (mode === 'player') {
      // Create a player and assign to a random domestic club across divisions 1-4
      let selectedTeam = teamName ? teams.find(t => t.id === teamName) : null;
      if (!selectedTeam) {
        selectedTeam =
          domesticTeams.length > 0
            ? domesticTeams[Math.floor(Math.random() * domesticTeams.length)]
            : null;
      }
      
      const createdPlayer: Player = {
        id: Math.random().toString(36).substr(2, 9),
        name: name,
        position: playerDetails?.position || 'ATK',
        overall: 65,
        age: playerDetails?.age || 18,
        energy: 100,
        isStarter: true,
        value: 1000000,
        salary: 10000,
        matchesPlayed: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        nationality: playerDetails?.nationality,
        preferredFoot: playerDetails?.preferredFoot,
        height: playerDetails?.height,
        weight: playerDetails?.weight,
        jerseyNumber: playerDetails?.jerseyNumber,
        careerGoals: 0,
        careerAssists: 0,
        careerMatches: 0,
        seasonMinutes: 0,
        averageRating: 0,
        ratingTotal: 0,
        ratingSamples: 0,
        form: 6,
        nationalCaps: 0,
        nationalGoals: 0,
        nationalCallUpHistory: [],
        nationalTournamentHistory: [],
        yellowCardsSeason: 0,
        redCardsSeason: 0,
        disciplinary: {},
        potential: 84,
        status: 'ACTIVE',
        cleanSheets: 0,
        saves: 0,
        savePercentage: 0,
        keyPasses: 0,
        tackles: 0,
        interceptions: 0,
        passAccuracy: 0,
        titlesWon: 0,
        youthProspect: false,
      };
      const newPlayer = recalculatePlayerEconomics(
        {
          ...createdPlayer,
          contract: createPlayerContract(createdPlayer, currentYear),
        },
        currentYear,
      );

      if (selectedTeam) {
        selectedTeam.players.push(newPlayer);
        selectedTeam.isUserControlled = true;
        userTeamId = selectedTeam.id;
        userPlayerId = newPlayer.id;
      }
    }

    const nationalTeams = generateNationalTeams(teams, currentYear, internationalCompetitions);
    const allTeams = [...teams, ...nationalTeams];

    const matches = generateSchedule(allTeams, { currentYear });

    set({
      teams: allTeams,
      matches,
      currentWeek: 1,
      userTeamId,
      userPlayerId,
      gameMode: mode,
      isGameOver: false,
      marketPlayers: [],
      activeMatchId: null,
      managerReputation: 10,
      jobOffers: [],
      currentYear,
      competitionHistory: {},
      retiredPlayersHistory: [],
      newsFeed: [
        createNewsItem(
          'GENERAL',
          'Nova carreira iniciada',
          mode === 'player'
            ? `${name} comeca a carreira em ${teams.find(team => team.id === userTeamId)?.name ?? 'seu clube'}.`
            : `${name} assume o comando de ${teams.find(team => team.id === userTeamId)?.name ?? 'seu clube'}.`,
          1,
          currentYear,
          { teamId: userTeamId ?? undefined, playerId: userPlayerId ?? undefined },
        ),
      ],
      recentRoundSummary: null,
      seasonReview: null,
    });
    
    get().generateMarket();
  },

  distributePrizeMoney: () => {
    const { teams } = get();
    
    set(state => ({
      teams: state.teams.map(team => {
        let prize = 0;
        let histPoints = 0;
        
        // League prizes based on division and points (simplified)
        const leagueMultiplier = team.division === 1 ? 1000000 : team.division === 2 ? 500000 : team.division === 3 ? 250000 : 100000;
        prize += team.stats.LEAGUE.points * leagueMultiplier;
        histPoints += team.stats.LEAGUE.points * (5 - team.division); // More points for higher divisions
        
        // Continental prizes
        prize += team.stats.CONTINENTAL.wins * 2000000;
        histPoints += team.stats.CONTINENTAL.wins * 10;
        
        prize += team.stats.CONTINENTAL_SECONDARY.wins * 1000000;
        histPoints += team.stats.CONTINENTAL_SECONDARY.wins * 5;
        
        // National Cup prizes
        prize += team.stats.NATIONAL_CUP.wins * 500000;
        histPoints += team.stats.NATIONAL_CUP.wins * 3;

        return {
          ...team,
          finances: team.finances + prize,
          historicalPoints: team.historicalPoints + histPoints
        };
      })
    }));
  },

  playWeek: (
    userMatchResult?:
      | { matchId: string, homeScore: number, awayScore: number, events: MatchEvent[] }
      | Array<{ matchId: string, homeScore: number, awayScore: number, events: MatchEvent[] }>
  ) => {
    const {
      matches,
      teams,
      currentWeek,
      currentYear = DEFAULT_START_YEAR,
      userTeamId,
      userPlayerId,
      gameMode,
      newsFeed = [],
    } = get();
    const userNationalTeamId =
      gameMode === 'player'
        ? teams.find(
            team =>
              team.division === 0 &&
              (team.players.some(player => player.id === userPlayerId) ||
                Object.values(team.competitionSquads ?? {}).some(players => players?.some(player => player.id === userPlayerId))),
          )?.id ?? null
        : null;
    const userEntityIds = new Set([userTeamId, userNationalTeamId].filter((value): value is string => Boolean(value)));
    
    const weekMatches = matches.filter(m => m.week === currentWeek && !m.played);
    if (weekMatches.length === 0) {
      // Check if game is over (no more matches)
      const hasMoreMatches = matches.some(m => m.week > currentWeek);
      if (!hasMoreMatches) {
        get().distributePrizeMoney();
        if (get().gameMode === 'manager') {
          get().generateJobOffers();
        } else if (get().gameMode === 'player') {
          get().generatePlayerOffers();
        }
        set({ isGameOver: true });
      } else {
        set({ currentWeek: currentWeek + 1 });
        // Generate market every 4 weeks
        if (currentWeek % 4 === 0) {
          get().generateMarket();
        }
      }
      return;
    }

    const updatedTeams = decrementPlayerInjuries(cloneTeams(teams));
    const updatedMatches = [...matches];
    const competitionHistory = cloneCompetitionHistory(get().competitionHistory);
    const providedResults = Array.isArray(userMatchResult)
      ? userMatchResult
      : userMatchResult
        ? [userMatchResult]
        : [];
    const providedResultMap = new Map(providedResults.map(result => [result.matchId, result]));
    const generatedNews: NewsItem[] = [];

    updatedTeams.forEach(team => {
      const teamCompetitionsThisWeek = weekMatches
        .filter(match => match.homeTeamId === team.id || match.awayTeamId === team.id)
        .map(match => match.competition);
      if (teamCompetitionsThisWeek.length === 0) return;
      enforceAvailableLineup(team, teamCompetitionsThisWeek);
    });

    updatedTeams.forEach(team => {
      if (team.division <= 0) return;
      const report = estimateWeeklyCommercialRevenue(team, currentWeek);
      team.finances += report.totalRevenue;
      team.commercial = {
        ...ensureTeamCommercial(team).commercial!,
        lastWeeklyReport: report,
      };
    });

    // Deduct weekly salaries (simplified: monthly salary / 4)
    updatedTeams.forEach(team => {
      const weeklySalary = team.players.reduce((sum, p) => sum + p.salary, 0) / 4;
      team.finances -= weeklySalary;
    });

    const playedPlayerIds = new Set<string>();

    weekMatches.forEach(match => {
      const home = updatedTeams.find(t => t.id === match.homeTeamId);
      const away = updatedTeams.find(t => t.id === match.awayTeamId);
      const hasBye = !home || !away;

      let result: { homeScore: number; awayScore: number; events: MatchEvent[] };
      let winnerInfo: { winnerTeamId: string | null; wentToPenalties: boolean } | undefined;
      const comp = match.competition;

      if (hasBye) {
        result = { homeScore: 0, awayScore: 0, events: [] };
        winnerInfo = {
          winnerTeamId: home?.id ?? away?.id ?? null,
          wentToPenalties: false,
        };
      } else {
        if (home.stadium) {
          const attendance = estimateMatchdayAttendance(home);
          const ticketRev = attendance * home.stadium.ticketPrice;
          const foodRev = attendance * home.stadium.foodLevel * 15;
          const merchRev = attendance * home.stadium.merchLevel * 25;
          home.finances += ticketRev + foodRev + merchRev;
        }

        const precomputedResult = providedResultMap.get(match.id);
        if (precomputedResult) {
          result = precomputedResult;
        } else {
          result = simulateMatch(home, away, { competition: comp, isKnockout: Boolean(match.isKnockout) });
        }

        if (match.isKnockout) {
          winnerInfo = resolveKnockoutWinner(home, away, result);
        }
      }

      const matchIndex = updatedMatches.findIndex(m => m.id === match.id);
      updatedMatches[matchIndex] = {
        ...match,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        played: true,
        winnerTeamId: winnerInfo?.winnerTeamId ?? match.winnerTeamId ?? null,
        wentToPenalties: winnerInfo?.wentToPenalties ?? false,
        events: result.events.map(event => ({ ...event, matchId: match.id })),
      };

      if (match.isKnockout && (match.roundSize ?? 0) === 2 && winnerInfo?.winnerTeamId) {
        const championTeam = updatedTeams.find(team => team.id === winnerInfo?.winnerTeamId);
        if (championTeam) {
          championTeam.players.forEach(player => {
            player.titlesWon = (player.titlesWon ?? 0) + 1;
          });
          if (comp === 'WORLD_CUP' || comp === 'OLYMPICS') {
            recordCompetitionChampion(competitionHistory, comp, {
              year: match.seasonYear ?? currentYear,
              championTeamId: championTeam.id,
              championName: championTeam.name,
            });
          }
        }
      }

      if (!home || !away) {
        return;
      }

      [home, away].forEach(team => {
        getCompetitionPlayers(team, comp).forEach(player => {
          mutatePlayerAcrossTeams(updatedTeams, player.id, currentPlayer => {
            const record = getPlayerCompetitionRecord(currentPlayer, comp);
            if (record.suspendedMatches > 0) {
              setPlayerCompetitionRecord(currentPlayer, comp, currentRecord => ({
                ...currentRecord,
                suspendedMatches: currentRecord.suspendedMatches - 1,
                matchesSuspended: currentRecord.matchesSuspended + 1,
              }));
            }
          });
        });
      });

      const { userTeamId, managerReputation } = get();
      let newReputation = managerReputation;
      const userParticipated = home.id === userTeamId || away.id === userTeamId;
      if (userParticipated) {
        if (match.isKnockout && winnerInfo?.winnerTeamId) {
          newReputation =
            winnerInfo.winnerTeamId === userTeamId
              ? Math.min(100, newReputation + 1)
              : Math.max(0, newReputation - 1);
        } else {
          const isHome = home.id === userTeamId;
          const userScore = isHome ? result.homeScore : result.awayScore;
          const oppScore = isHome ? result.awayScore : result.homeScore;

          if (userScore > oppScore) newReputation = Math.min(100, newReputation + 1);
          else if (userScore < oppScore) newReputation = Math.max(0, newReputation - 1);
          else newReputation = Math.min(100, newReputation + 0.2);
        }
        set({ managerReputation: newReputation });

        generatedNews.push(
          createNewsItem(
            'MATCH',
            `Resultado: ${home.name} ${result.homeScore} x ${result.awayScore} ${away.name}`,
            match.isKnockout && winnerInfo?.wentToPenalties
              ? `A decisao foi para os penaltis em ${match.competition}.`
              : `Partida concluida em ${match.competition}.`,
            currentWeek,
            currentYear,
            { teamId: home.id === userTeamId || home.id === userNationalTeamId ? home.id : away.id },
          ),
        );
      }

      const homeIndex = updatedTeams.findIndex(team => team.id === home.id);
      const awayIndex = updatedTeams.findIndex(team => team.id === away.id);
      const isInternationalMatch = home.division === 0 && away.division === 0;

      updatedTeams[homeIndex].stats[comp].goalsFor += result.homeScore;
      updatedTeams[homeIndex].stats[comp].goalsAgainst += result.awayScore;
      updatedTeams[homeIndex].stats[comp].played += 1;

      updatedTeams[awayIndex].stats[comp].goalsFor += result.awayScore;
      updatedTeams[awayIndex].stats[comp].goalsAgainst += result.homeScore;
      updatedTeams[awayIndex].stats[comp].played += 1;

      if (match.isKnockout) {
        if (winnerInfo?.winnerTeamId === home.id) {
          updatedTeams[homeIndex].stats[comp].wins += 1;
          updatedTeams[homeIndex].stats[comp].points += 3;
          updatedTeams[awayIndex].stats[comp].losses += 1;
        } else if (winnerInfo?.winnerTeamId === away.id) {
          updatedTeams[awayIndex].stats[comp].wins += 1;
          updatedTeams[awayIndex].stats[comp].points += 3;
          updatedTeams[homeIndex].stats[comp].losses += 1;
        } else if (result.homeScore === result.awayScore) {
          updatedTeams[homeIndex].stats[comp].draws += 1;
          updatedTeams[homeIndex].stats[comp].points += 1;
          updatedTeams[awayIndex].stats[comp].draws += 1;
          updatedTeams[awayIndex].stats[comp].points += 1;
        }
      } else if (result.homeScore > result.awayScore) {
        updatedTeams[homeIndex].stats[comp].wins += 1;
        updatedTeams[homeIndex].stats[comp].points += 3;
        updatedTeams[awayIndex].stats[comp].losses += 1;
      } else if (result.homeScore < result.awayScore) {
        updatedTeams[awayIndex].stats[comp].wins += 1;
        updatedTeams[awayIndex].stats[comp].points += 3;
        updatedTeams[homeIndex].stats[comp].losses += 1;
      } else {
        updatedTeams[homeIndex].stats[comp].draws += 1;
        updatedTeams[homeIndex].stats[comp].points += 1;
        updatedTeams[awayIndex].stats[comp].draws += 1;
        updatedTeams[awayIndex].stats[comp].points += 1;
      }

      const homeEvents = result.events.filter(event => event.teamId === home.id);
      const awayEvents = result.events.filter(event => event.teamId === away.id);
      const homeMatchTeam = { ...home, players: getCompetitionPlayers(home, comp) };
      const awayMatchTeam = { ...away, players: getCompetitionPlayers(away, comp) };
      const homeMinutes = getMinutesPlayedMap(homeMatchTeam, homeEvents);
      const awayMinutes = getMinutesPlayedMap(awayMatchTeam, awayEvents);

      const registerPlayerAppearance = (
        participantTeam: Team,
        participantEvents: MatchEvent[],
        minutesMap: Map<string, number>,
        teamScore: number,
        opponentScore: number,
      ) => {
        const competitionPlayers = getCompetitionPlayers(participantTeam, comp);
        const activePlayerIds = new Set<string>([
          ...competitionPlayers.filter(player => player.isStarter).map(player => player.id),
          ...participantEvents
            .filter(event => event.type === 'SUBSTITUTION')
            .map(event => event.playerId),
        ]);

        activePlayerIds.forEach(playerId => {
          const minutesPlayed = minutesMap.get(playerId) ?? 0;
          if (minutesPlayed <= 0) return;

          playedPlayerIds.add(playerId);
          const rating = calculatePlayerRating(playerId, teamScore, opponentScore, participantEvents, minutesPlayed);

          mutatePlayerAcrossTeams(updatedTeams, playerId, player => {
            player.matchesPlayed += 1;
            player.careerMatches = (player.careerMatches || 0) + 1;
            player.seasonMinutes = (player.seasonMinutes || 0) + minutesPlayed;
            player.ratingSamples = (player.ratingSamples || 0) + 1;
            player.ratingTotal = (player.ratingTotal || 0) + rating;
            player.averageRating = Number((player.ratingTotal / player.ratingSamples).toFixed(2));
            player.form = Number((((player.form ?? 6) * 0.7) + rating * 0.3).toFixed(2));

            if (player.position === 'MID') {
              player.keyPasses = (player.keyPasses ?? 0) + Math.max(0, Math.round(rating - 5));
              player.passAccuracy = Number(
                clamp(
                  (((player.passAccuracy ?? 74) * Math.max(player.matchesPlayed - 1, 0)) + (72 + rating * 2)) /
                    player.matchesPlayed,
                  55,
                  95,
                ).toFixed(1),
              );
            } else if (player.position === 'DEF') {
              player.tackles = (player.tackles ?? 0) + Math.max(1, Math.round((minutesPlayed / 90) * (2 + rating / 2)));
              player.interceptions =
                (player.interceptions ?? 0) + Math.max(1, Math.round((minutesPlayed / 90) * (1 + rating / 2.4)));
            } else if (player.position === 'GK') {
              const goalsConceded = opponentScore;
              const estimatedShotsOnTarget = Math.max(goalsConceded + 1, Math.round(3 + opponentScore * 1.8 + (10 - rating)));
              const saves = Math.max(0, estimatedShotsOnTarget - goalsConceded);
              const totalSaves = (player.saves ?? 0) + saves;
              player.saves = totalSaves;
              player.savePercentage = Number(
                ((totalSaves / Math.max(totalSaves + goalsConceded, 1)) * 100).toFixed(1),
              );
            }

            if (opponentScore === 0 && (player.position === 'GK' || player.position === 'DEF')) {
              player.cleanSheets = (player.cleanSheets ?? 0) + 1;
            }

            if (isInternationalMatch) {
              player.nationalCaps = (player.nationalCaps || 0) + 1;
            }
          });
        });
      };

      registerPlayerAppearance(home, homeEvents, homeMinutes, result.homeScore, result.awayScore);
      registerPlayerAppearance(away, awayEvents, awayMinutes, result.awayScore, result.homeScore);

      const maybeCreateInjuryEvent = (
        participantTeam: Team,
        participantMinutes: Map<string, number>,
        baseMinute: number,
      ) => {
        const injuryChance = match.competition === 'REGIONAL' || match.competition === 'NATIONAL_CUP' ? 0.07 : 0.05;
        if (Math.random() > injuryChance) return;

        const candidates = participantTeam.players.filter(
          player => (participantMinutes.get(player.id) ?? 0) >= 20 && !isPlayerInjured(player),
        );
        if (candidates.length === 0) return;

        const injuredPlayer = candidates[Math.floor(Math.random() * candidates.length)];
        const weeksRemaining = Math.floor(Math.random() * 4) + 1;
        const severity = weeksRemaining >= 4 ? 'HIGH' : weeksRemaining >= 2 ? 'MEDIUM' : 'LOW';
        const injuryType =
          severity === 'HIGH'
            ? 'lesao muscular'
            : severity === 'MEDIUM'
              ? 'entorse'
              : 'desconforto muscular';
        const eventMinute = Math.min(118, baseMinute + Math.floor(Math.random() * 6));
        const injuryEvent: MatchEvent = {
          id: Math.random().toString(36).slice(2, 11),
          matchId: match.id,
          minute: eventMinute,
          type: 'INJURY',
          teamId: participantTeam.id,
          playerId: injuredPlayer.id,
          reason: `${injuryType} (${weeksRemaining} semana${weeksRemaining > 1 ? 's' : ''})`,
        };

        mutatePlayerAcrossTeams(updatedTeams, injuredPlayer.id, player => {
          player.injury = {
            type: injuryType,
            severity,
            startWeek: currentWeek,
            expectedRecoveryWeek: currentWeek + weeksRemaining,
            weeksRemaining,
          };
          player.energy = Math.max(0, player.energy - 10);
          player.form = Number(Math.max(4.5, (player.form ?? 6) - 0.35).toFixed(2));
        });

        result.events.push(injuryEvent);

        if (userEntityIds.has(participantTeam.id)) {
          generatedNews.push(
            createNewsItem(
              'INJURY',
              'Departamento medico em alerta',
              `${injuredPlayer.name} sofreu ${injuryType} e desfalca ${participantTeam.name} por ${weeksRemaining} semana${weeksRemaining > 1 ? 's' : ''}.`,
              currentWeek,
              currentYear,
              { teamId: participantTeam.id, playerId: injuredPlayer.id },
            ),
          );
        }
      };

      maybeCreateInjuryEvent(home, homeMinutes, 58);
      maybeCreateInjuryEvent(away, awayMinutes, 63);

      updatedMatches[matchIndex] = {
        ...updatedMatches[matchIndex],
        events: [...result.events].sort((eventA, eventB) => eventA.minute - eventB.minute),
      };

      result.events.forEach(event => {
        mutatePlayerAcrossTeams(updatedTeams, event.playerId, player => {
          if (event.type === 'GOAL') {
            player.goals += 1;
            player.careerGoals = (player.careerGoals || 0) + 1;
            if (isInternationalMatch) {
              player.nationalGoals = (player.nationalGoals || 0) + 1;
            }
          }

          if (event.type === 'YELLOW_CARD') {
            player.yellowCards += 1;
            player.yellowCardsSeason = (player.yellowCardsSeason || 0) + 1;
            if (event.reason !== 'Segundo amarelo') {
              setPlayerCompetitionRecord(player, comp, currentRecord => {
                const accumulatedYellows = currentRecord.accumulatedYellows + 1;
                const suspendedMatches =
                  accumulatedYellows >= YELLOW_SUSPENSION_THRESHOLD
                    ? currentRecord.suspendedMatches + 1
                    : currentRecord.suspendedMatches;
                return {
                  ...currentRecord,
                  yellowCards: currentRecord.yellowCards + 1,
                  accumulatedYellows:
                    accumulatedYellows >= YELLOW_SUSPENSION_THRESHOLD ? 0 : accumulatedYellows,
                  suspendedMatches,
                };
              });
            }
          }

          if (event.type === 'RED_CARD') {
            player.redCards += 1;
            player.redCardsSeason = (player.redCardsSeason || 0) + 1;
            setPlayerCompetitionRecord(player, comp, currentRecord => ({
              ...currentRecord,
              redCards: currentRecord.redCards + 1,
              suspendedMatches: currentRecord.suspendedMatches + (event.reason === 'Conduta violenta' ? 2 : 1),
            }));
          }
        });

        if (event.type === 'GOAL' && event.assistPlayerId) {
          mutatePlayerAcrossTeams(updatedTeams, event.assistPlayerId, player => {
            player.assists += 1;
            player.careerAssists = (player.careerAssists || 0) + 1;
          });
        }

        if (event.type === 'SUBSTITUTION') {
          playedPlayerIds.add(event.playerId);
          if (event.assistPlayerId) {
            playedPlayerIds.add(event.assistPlayerId);
          }
        }
      });
    });

    // Update Energy
    const processedEnergy = new Map<string, number>();
    updatedTeams.forEach(team => {
      team.players.forEach(player => {
        if (!processedEnergy.has(player.id)) {
          if (playedPlayerIds.has(player.id)) {
            // Played: lose energy
            player.energy = Math.max(0, Math.round(player.energy - (15 + Math.random() * 15)));
          } else {
            // Rested: gain energy
            player.energy = Math.min(100, Math.round(player.energy + (20 + Math.random() * 10)));
          }
          processedEnergy.set(player.id, player.energy);
        } else {
          // Sync energy if already processed
          player.energy = processedEnergy.get(player.id)!;
        }
      });
    });

    const nextGroupStageMatches = advanceInternationalGroupTournaments(updatedMatches, updatedTeams, currentWeek);
    const nextKnockoutMatches = advanceKnockoutTournaments(updatedMatches, updatedTeams, currentWeek);
    const domesticCompetitions: Competition[] = ['LEAGUE', 'REGIONAL', 'NATIONAL_CUP'];
    const continentalAlreadyScheduled = updatedMatches.some(match => match.competition === 'CONTINENTAL');
    const pendingDomesticMatches = updatedMatches.some(
      match => domesticCompetitions.includes(match.competition) && !match.played,
    );

    const continentalMatches =
      !continentalAlreadyScheduled && !pendingDomesticMatches
        ? generateContinentalCompetitions(updatedTeams, updatedTeams, currentYear, currentWeek + 1, updatedMatches)
        : [];

    const nextMatches = [...updatedMatches, ...nextGroupStageMatches, ...nextKnockoutMatches, ...continentalMatches].sort(
      (matchA, matchB) => matchA.week - matchB.week,
    );
    const hasMoreMatches = nextMatches.some(match => !match.played && match.week > currentWeek);
    const finalTeams = !hasMoreMatches
      ? updatedTeams.map(team => {
          let prize = 0;
          let histPoints = 0;
          const leagueMultiplier =
            team.division === 1 ? 1_000_000 : team.division === 2 ? 500_000 : team.division === 3 ? 250_000 : 100_000;
          prize += team.stats.LEAGUE.points * leagueMultiplier;
          histPoints += team.stats.LEAGUE.points * (5 - Math.max(team.division, 1));
          prize += team.stats.CONTINENTAL.wins * 2_000_000;
          histPoints += team.stats.CONTINENTAL.wins * 10;
          prize += team.stats.CONTINENTAL_SECONDARY.wins * 1_000_000;
          histPoints += team.stats.CONTINENTAL_SECONDARY.wins * 5;
          prize += team.stats.NATIONAL_CUP.wins * 500_000;
          histPoints += team.stats.NATIONAL_CUP.wins * 3;

          return {
            ...team,
            finances: team.finances + prize,
            historicalPoints: team.historicalPoints + histPoints,
          };
        })
      : updatedTeams;
    const recentRoundSummary = buildWeekSummary(currentWeek, currentYear, updatedMatches.filter(match => match.week === currentWeek), updatedTeams, userEntityIds);
    const seasonReview = hasMoreMatches ? get().seasonReview ?? null : buildSeasonReview(finalTeams, updatedMatches, currentYear);
    const seasonNews = !hasMoreMatches
      ? [
          ...seasonReview.promoted.map(movement =>
            createNewsItem(
              'SEASON',
              'Promocao confirmada',
              `${movement.teamName} garantiu acesso para a divisao ${movement.toDivision}.`,
              currentWeek,
              currentYear,
              { teamId: movement.teamId },
            ),
          ),
          ...seasonReview.relegated.map(movement =>
            createNewsItem(
              'SEASON',
              'Rebaixamento confirmado',
              `${movement.teamName} caiu para a divisao ${movement.toDivision}.`,
              currentWeek,
              currentYear,
              { teamId: movement.teamId },
            ),
          ),
        ]
      : [];

    set({
      teams: finalTeams,
      matches: nextMatches,
      currentWeek: currentWeek + 1,
      competitionHistory,
      recentRoundSummary,
      newsFeed: appendNewsFeed(newsFeed, [...seasonNews, ...generatedNews]),
      seasonReview,
      isGameOver: !hasMoreMatches,
    });

    if (!hasMoreMatches) {
      if (get().gameMode === 'manager') {
        get().generateJobOffers();
      } else if (get().gameMode === 'player') {
        get().generatePlayerOffers();
      }
    }
  },

  updateLineup: (teamId, starters) => {
    set(state => ({
      teams: state.teams.map(team => {
        if (team.id !== teamId) return team;
        return {
          ...team,
          players: team.players.map(player => ({
            ...player,
            isStarter: starters.includes(player.id)
          }))
        };
      })
    }));
  },

  toggleStarter: (playerId) => {
    set(state => {
      const { userTeamId, teams, gameMode } = state;
      if (!userTeamId || gameMode === 'player') return state;

      const userTeam = teams.find(t => t.id === userTeamId);
      if (!userTeam) return state;

      const player = userTeam.players.find(p => p.id === playerId);
      if (!player) return state;
      const nextUserMatch = state.matches.find(
        match =>
          !match.played &&
          (match.homeTeamId === userTeamId || match.awayTeamId === userTeamId),
      );
      if (nextUserMatch && isPlayerSuspendedForCompetition(player, nextUserMatch.competition)) {
        return state;
      }
      if (isPlayerInjured(player)) {
        return state;
      }

      const startersCount = userTeam.players.filter(p => p.isStarter).length;

      // Se já é titular, pode remover (a menos que seja o único, mas vamos permitir)
      // Se não é titular, só pode adicionar se tiver menos de 11
      if (!player.isStarter && startersCount >= 11) {
        return state;
      }

      return {
        teams: state.teams.map(team => {
          if (team.id !== userTeamId) return team;
          return {
            ...team,
            players: team.players.map(p => 
              p.id === playerId ? { ...p, isStarter: !p.isStarter } : p
            )
          };
        })
      };
    });
  },

  upgradeStadium: (type) => {
    const { teams, userTeamId } = get();
    if (!userTeamId) return;

    set(state => ({
      teams: state.teams.map(team => {
        if (team.id !== userTeamId) return team;

        const newTeam = { ...team };
        
        if (type === 'build' && !newTeam.stadium) {
          const cost = 5000000;
          if (newTeam.finances >= cost) {
            newTeam.finances -= cost;
            newTeam.stadium = {
              name: `Arena ${newTeam.name}`,
              capacity: 5000,
              ticketPrice: 30,
              foodLevel: 0,
              merchLevel: 0
            };
          }
        } else if (newTeam.stadium) {
          if (type === 'capacity') {
            const cost = 2000000;
            if (newTeam.finances >= cost) {
              newTeam.finances -= cost;
              newTeam.stadium.capacity += 5000;
            }
          } else if (type === 'food') {
            const cost = 1000000;
            if (newTeam.finances >= cost && newTeam.stadium.foodLevel < 5) {
              newTeam.finances -= cost;
              newTeam.stadium.foodLevel += 1;
            }
          } else if (type === 'merch') {
            const cost = 1500000;
            if (newTeam.finances >= cost && newTeam.stadium.merchLevel < 5) {
              newTeam.finances -= cost;
              newTeam.stadium.merchLevel += 1;
            }
          }
        }
        return newTeam;
      })
    }));
  },

  updateClubPrice: (field, value) => {
    const { userTeamId } = get();
    if (!userTeamId) return;

    const normalizedValue = Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;

    set(state => ({
      teams: state.teams.map(team => {
        if (team.id !== userTeamId) return team;

        const updatedTeam = ensureTeamCommercial({ ...team });
        if (field === 'ticketPrice' && updatedTeam.stadium) {
          return {
            ...updatedTeam,
            stadium: {
              ...updatedTeam.stadium,
              ticketPrice: normalizedValue,
            },
          };
        }

        return {
          ...updatedTeam,
          commercial: {
            ...updatedTeam.commercial!,
            [field]: normalizedValue,
          },
        };
      }),
    }));
  },

  trainPlayer: () => {
    const { teams, userPlayerId } = get();
    if (!userPlayerId) return undefined;

    let result = { success: false, improved: false, message: 'Não foi possível treinar.' };
    let energyDeducted = false;
    let overallIncreased = false;
    let newOverall = 0;
    let newValue = 0;
    let newSalary = 0;

    set(state => ({
      teams: state.teams.map(team => {
        const playerIndex = team.players.findIndex(p => p.id === userPlayerId);
        if (playerIndex !== -1) {
          const newTeam = { ...team };
          const player = { ...newTeam.players[playerIndex] };
          
          if (!energyDeducted) {
            if (player.energy >= 20) {
              player.energy -= 20;
              result.success = true;
              result.message = 'Treino concluído! Você gastou 20 de energia.';
              // Small chance to increase overall
              if (Math.random() > 0.7 && player.overall < 99) {
                player.overall += 1;
                player.potential = Math.max(player.potential ?? player.overall, player.overall + 2);
                Object.assign(player, recalculatePlayerEconomics(player, get().currentYear ?? DEFAULT_START_YEAR));
                result.improved = true;
                result.message = 'Treino excelente! Seu overall aumentou em +1.';
                
                overallIncreased = true;
                newOverall = player.overall;
                newValue = player.value;
                newSalary = player.salary;
              }
              energyDeducted = true;
            } else {
              result.message = 'Energia insuficiente para treinar.';
              return team; // Don't update if not enough energy
            }
          } else {
            // Apply the same updates to other instances of the player (e.g., national team)
            player.energy -= 20;
            if (overallIncreased) {
              player.overall = newOverall;
              player.value = newValue;
              player.salary = newSalary;
              Object.assign(player, recalculatePlayerEconomics(player, get().currentYear ?? DEFAULT_START_YEAR));
            }
          }
          
          newTeam.players[playerIndex] = player;
          return newTeam;
        }
        return team;
      })
    }));

    return result;
  },

  generateJobOffers: () => {
    const { teams, managerReputation, gameMode, userTeamId } = get();
    if (gameMode !== 'manager') return;

    const offers: string[] = [];
    
    let targetDivision = 4;
    if (managerReputation > 75) targetDivision = 1;
    else if (managerReputation > 50) targetDivision = 2;
    else if (managerReputation > 25) targetDivision = 3;

    // Get teams from target division or lower (excluding current team)
    const eligibleTeams = teams.filter(t => t.division >= targetDivision && t.id !== userTeamId);
    
    // Pick 1-3 random teams
    const numOffers = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < numOffers; i++) {
      if (eligibleTeams.length > 0) {
        const randomIndex = Math.floor(Math.random() * eligibleTeams.length);
        offers.push(eligibleTeams[randomIndex].id);
        eligibleTeams.splice(randomIndex, 1); // Prevent duplicate offers
      }
    }

    set({ jobOffers: offers });
  },

  acceptJobOffer: (teamId: string) => {
    const { teams, userTeamId } = get();
    set({
      teams: teams.map(t => {
        if (t.id === userTeamId) return { ...t, isUserControlled: false };
        if (t.id === teamId) return { ...t, isUserControlled: true };
        return t;
      }),
      userTeamId: teamId,
      jobOffers: []
    });
  },

  generatePlayerOffers: () => {
    const { teams, userPlayerId, userTeamId } = get();
    const offers: string[] = [];
    
    const userTeam = teams.find(t => t.id === userTeamId);
    if (!userTeam) return;
    
    const userPlayer = userTeam.players.find(p => p.id === userPlayerId);
    if (!userPlayer) return;

    let maxDivision = 4;
    if (userPlayer.overall >= 82 || (userPlayer.averageRating ?? 6) >= 7.4) maxDivision = 1;
    else if (userPlayer.overall >= 72 || (userPlayer.averageRating ?? 6) >= 7.0) maxDivision = 2;
    else if (userPlayer.overall >= 62) maxDivision = 3;

    const eligibleTeams = teams.filter(t => t.division > 0 && t.division <= maxDivision && t.id !== userTeamId);
    
    // Pick 1-3 random teams
    const numOffers = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < numOffers; i++) {
      if (eligibleTeams.length > 0) {
        const randomIndex = Math.floor(Math.random() * eligibleTeams.length);
        offers.push(eligibleTeams[randomIndex].id);
        eligibleTeams.splice(randomIndex, 1); // Prevent duplicate offers
      }
    }

    set({ jobOffers: offers });
  },

  acceptPlayerOffer: (teamId: string) => {
    const { teams, userTeamId, userPlayerId } = get();
    
    const oldTeam = teams.find(t => t.id === userTeamId);
    if (!oldTeam) return;
    
    const userPlayer = oldTeam.players.find(p => p.id === userPlayerId);
    if (!userPlayer) return;

    set({
      teams: teams.map(t => {
        if (t.id === userTeamId) {
          return {
            ...t,
            isUserControlled: false,
            players: t.players.filter(p => p.id !== userPlayerId)
          };
        }
        if (t.id === teamId) {
          return {
            ...t,
            isUserControlled: true,
            players: [...t.players, { ...userPlayer, isStarter: true }]
          };
        }
        return t;
      }),
      userTeamId: teamId,
      jobOffers: []
    });
  },

  renewPlayerContract: (playerId: string) => {
    const { teams, userTeamId, currentYear = DEFAULT_START_YEAR, currentWeek, newsFeed = [] } = get();
    if (!userTeamId) return;

    const userTeam = teams.find(team => team.id === userTeamId);
    const player = userTeam?.players.find(currentPlayer => currentPlayer.id === playerId);
    if (!userTeam || !player) return;

    const currentContract = player.contract ?? createPlayerContract(player, currentYear);
    const durationYears =
      currentContract.role === 'PROSPECT'
        ? 2
        : currentContract.requestedSalaryIncrease || currentContract.renewalPreference === 'HIGH'
          ? 4
          : 3;
    const salaryMultiplier = currentContract.requestedSalaryIncrease ? 1.18 : 1.08;

    set({
      teams: teams.map(team => {
        if (team.id !== userTeamId) return team;

        return {
          ...team,
          players: team.players.map(player => {
            if (player.id !== playerId) return player;
            const normalizedPlayer = normalizePlayer(player);
            const renewed = recalculatePlayerEconomics(normalizedPlayer, currentYear);
            const latestContract = renewed.contract ?? createPlayerContract(renewed, currentYear);

            return {
              ...renewed,
              contract: {
                ...latestContract,
                startYear: currentYear,
                endYear: currentYear + durationYears,
                durationYears,
                salary: roundMoney(latestContract.salary * salaryMultiplier),
                bonus: roundMoney(latestContract.bonus * (currentContract.requestedSalaryIncrease ? 1.15 : 1.05)),
                releaseClause: roundMoney(latestContract.releaseClause * 1.12),
                requestedTransfer: false,
                requestedSalaryIncrease: false,
                lastSeasonGoalsMet: true,
              },
            };
          }),
        };
      }),
      newsFeed: appendNewsFeed(newsFeed, [
        createNewsItem(
          'CONTRACT',
          'Renovacao assinada',
          `${player.name} renovou com ${userTeam.name} ate ${currentYear + durationYears}.`,
          currentWeek,
          currentYear,
          { teamId: userTeam.id, playerId: player.id },
        ),
      ]),
    });
  },

  releasePlayer: (playerId: string) => {
    const { teams, userTeamId, marketPlayers } = get();
    if (!userTeamId) return;

    const userTeam = teams.find(team => team.id === userTeamId);
    const playerToRelease = userTeam?.players.find(player => player.id === playerId);
    if (!playerToRelease) return;

    set({
      teams: teams.map(team =>
        team.id === userTeamId
          ? {
              ...team,
              players: team.players.filter(player => player.id !== playerId),
            }
          : team,
      ),
      marketPlayers: [...marketPlayers, { ...playerToRelease }],
    });
  },

  promoteAcademyPlayer: (playerId: string) => {
    const { teams, userTeamId, currentYear = DEFAULT_START_YEAR } = get();
    if (!userTeamId) return;

    set({
      teams: teams.map(team => {
        if (team.id !== userTeamId) return team;
        const academyPlayer = team.academyPlayers?.find(player => player.id === playerId);
        if (!academyPlayer) return team;

        const promotedPlayer = recalculatePlayerEconomics(
          {
            ...normalizePlayer(academyPlayer),
            youthProspect: false,
            contract: createPlayerContract({ ...normalizePlayer(academyPlayer), youthProspect: false }, currentYear),
          },
          currentYear,
        );

        return {
          ...team,
          players: [...team.players, promotedPlayer],
          academyPlayers: (team.academyPlayers ?? []).filter(player => player.id !== playerId),
        };
      }),
    });
  },

  requestPlayerTransfer: () => {
    const { teams, userTeamId, userPlayerId, currentWeek, currentYear = DEFAULT_START_YEAR, newsFeed = [] } = get();
    if (!userTeamId || !userPlayerId) return;

    const userTeam = teams.find(team => team.id === userTeamId);
    const userPlayer = userTeam?.players.find(player => player.id === userPlayerId);
    if (!userTeam || !userPlayer) return;

    set({
      teams: teams.map(team => ({
        ...team,
        players: team.players.map(player =>
          player.id === userPlayerId
            ? {
                ...player,
                contract: player.contract
                  ? {
                      ...player.contract,
                      requestedTransfer: true,
                    }
                  : player.contract,
              }
            : player,
        ),
      })),
      newsFeed: appendNewsFeed(newsFeed, [
        createNewsItem(
          'TRANSFER',
          'Pedido de transferencia',
          `${userPlayer.name} informou ao ${userTeam.name} que deseja ouvir propostas.`,
          currentWeek,
          currentYear,
          { teamId: userTeam.id, playerId: userPlayer.id },
        ),
      ]),
    });

    get().generatePlayerOffers();
  },

  retireUserPlayer: () => {
    const { teams, userPlayerId, userTeamId, currentYear = DEFAULT_START_YEAR, retiredPlayersHistory = [] } = get();
    if (!userPlayerId || !userTeamId) return;

    const userTeam = teams.find(team => team.id === userTeamId);
    const userPlayer = userTeam?.players.find(player => player.id === userPlayerId);
    if (!userPlayer) return;

    const retiredRecord = createRetiredPlayerRecord(normalizePlayer(userPlayer), currentYear);

    set({
      ...initialState,
      retiredPlayersHistory: [...retiredPlayersHistory, retiredRecord],
      isGameOver: true,
    });
  },

  nextSeason: () => {
    const {
      teams,
      matches,
      userPlayerId,
      gameMode,
      currentYear = DEFAULT_START_YEAR,
      retiredPlayersHistory = [],
      newsFeed = [],
      userTeamId,
    } = get();
    const nextYear = currentYear + 1;
    const internationalCompetitions = getInternationalCompetitionsForYear(nextYear);
    const clubTeams = teams.filter(team => team.division > 0).map(team => normalizeTeam(team, currentYear));

    const updatedRetiredHistory: RetiredPlayerRecord[] = [...retiredPlayersHistory];
    const offSeasonFreeAgents: Player[] = [];

    const progressedClubTeams = clubTeams.map(team => {
      const regenPlayers: Player[] = [];
      const retainedPlayers: Player[] = [];

      team.players.forEach(player => {
        const normalizedPlayer = normalizePlayer(player);
        const newAge = normalizedPlayer.age + 1;
        const performanceBoost =
          ((normalizedPlayer.averageRating ?? 6) >= 7.2 ? 1 : 0) +
          ((normalizedPlayer.form ?? 6) >= 7 ? 1 : 0) +
          (normalizedPlayer.matchesPlayed > 18 ? 1 : 0);
        let overallDelta = 0;

        if (newAge <= 22) overallDelta = Math.floor(Math.random() * 2) + performanceBoost;
        else if (newAge <= 28) overallDelta = performanceBoost > 1 ? 1 : 0;
        else if (newAge <= 32) overallDelta = performanceBoost > 1 ? 0 : -Math.floor(Math.random() * 2);
        else overallDelta = -1 - Math.floor(Math.random() * 2);

        if (gameMode === 'player' && normalizedPlayer.id === userPlayerId && newAge < 35) {
          overallDelta = Math.max(overallDelta, performanceBoost);
        }

        const progressedPlayer = refreshContractForNewSeason(
          recalculatePlayerEconomics(
            {
              ...normalizedPlayer,
              age: newAge,
              overall: clamp(normalizedPlayer.overall + overallDelta, 40, 99),
              potential: Math.max(normalizedPlayer.potential ?? normalizedPlayer.overall, normalizedPlayer.overall + 1),
            },
            nextYear,
          ),
          team,
          clubTeams,
          nextYear,
        );

        const isUserCareerPlayer = gameMode === 'player' && progressedPlayer.id === userPlayerId;
        if (shouldPlayerRetire(progressedPlayer, !isUserCareerPlayer)) {
          updatedRetiredHistory.push(createRetiredPlayerRecord(progressedPlayer, nextYear));
          regenPlayers.push(createRegenPlayer(progressedPlayer, nextYear));
          return;
        }

        const isExpiredWithoutRenewal = (progressedPlayer.contract?.endYear ?? nextYear) < nextYear;
        const shouldKeepForUserManagerDecision =
          team.isUserControlled && gameMode === 'manager' && progressedPlayer.contract?.requestedTransfer;

        if (isExpiredWithoutRenewal && !isUserCareerPlayer && !shouldKeepForUserManagerDecision) {
          offSeasonFreeAgents.push(resetPlayerSeasonStats(progressedPlayer));
          return;
        }

        retainedPlayers.push(progressedPlayer);
      });

      const academyRefreshedTeam = refreshTeamAcademyForNewSeason(
        {
          ...team,
          players: retainedPlayers,
          overall: calculateTeamOverall(retainedPlayers),
        },
        nextYear,
        regenPlayers,
      );

      const promotedTeam = autoPromoteAcademyPlayers(academyRefreshedTeam, nextYear);

      return {
        ...promotedTeam,
        overall: calculateTeamOverall(promotedTeam.players),
      };
    });

    const rebalancedClubTeams = applyPromotionAndRelegation(progressedClubTeams, matches);
    const sponsoredClubTeams = refreshSponsorsForNewSeason(rebalancedClubTeams, nextYear);

    const resetClubTeams = sponsoredClubTeams.map(team => {
      const resetPlayers = team.players.map(player => resetPlayerSeasonStats(recalculatePlayerEconomics(player, nextYear)));
      const resetAcademy = (team.academyPlayers ?? []).map(player => resetPlayerSeasonStats(recalculatePlayerEconomics(player, nextYear)));

      return {
        ...team,
        players: resetPlayers,
        academyPlayers: resetAcademy,
        overall: calculateTeamOverall(resetPlayers),
        stats: buildCompetitionStats(),
      };
    });

    const newNationalTeams = generateNationalTeams(sponsoredClubTeams, nextYear, internationalCompetitions).map(team => {
      const resetPlayers = team.players.map(player => resetPlayerSeasonStats(player));
      return {
        ...team,
        players: resetPlayers,
        overall: calculateTeamOverall(resetPlayers),
        stats: buildCompetitionStats(),
      };
    });

    const allUpdatedTeams = [...resetClubTeams, ...newNationalTeams];
    const newMatches = generateSchedule(allUpdatedTeams, {
      currentYear: nextYear,
      qualificationSourceTeams: sponsoredClubTeams,
    });

    set({
      teams: allUpdatedTeams,
      matches: newMatches,
      currentWeek: 1,
      isGameOver: false,
      jobOffers: [],
      marketPlayers: offSeasonFreeAgents,
      currentYear: nextYear,
      competitionHistory: get().competitionHistory ?? {},
      retiredPlayersHistory: updatedRetiredHistory,
      recentRoundSummary: null,
      newsFeed: appendNewsFeed(newsFeed, [
        createNewsItem(
          'SEASON',
          'Nova temporada aberta',
          `A temporada ${nextYear} comecou para ${allUpdatedTeams.find(team => team.id === userTeamId)?.name ?? 'seu clube'}.`,
          1,
          nextYear,
          { teamId: userTeamId ?? undefined, playerId: gameMode === 'player' ? userPlayerId ?? undefined : undefined },
        ),
      ]),
    });
  }
}));
