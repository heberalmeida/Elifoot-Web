import { Competition, Match, Team } from '../types/game';

export const BYE_TEAM_ID = 'BYE';
export const DEFAULT_START_YEAR = 2026;
const PRIMARY_CONTINENTS: Array<Team['continent']> = ['SA', 'EU', 'NA'];
export const PROJECTED_CONTINENTAL_DURATION_WEEKS = 5;

export const createMatch = (
  homeTeamId: string,
  awayTeamId: string,
  week: number,
  competition: Competition,
  extras: Partial<Match> = {},
): Match => ({
  id: Math.random().toString(36).substr(2, 9),
  homeTeamId,
  awayTeamId,
  homeScore: 0,
  awayScore: 0,
  week,
  played: false,
  events: [],
  competition,
  ...extras,
});

const getHeadToHeadTiebreaker = (
  teamA: Team,
  teamB: Team,
  competition: Competition,
  matches: Match[],
) => {
  const headToHeadMatches = matches.filter(
    match =>
      match.played &&
      match.competition === competition &&
      ((match.homeTeamId === teamA.id && match.awayTeamId === teamB.id) ||
        (match.homeTeamId === teamB.id && match.awayTeamId === teamA.id)),
  );

  if (headToHeadMatches.length === 0) return 0;

  const summary = headToHeadMatches.reduce(
    (acc, match) => {
      const isTeamAHome = match.homeTeamId === teamA.id;
      const teamAScore = isTeamAHome ? match.homeScore : match.awayScore;
      const teamBScore = isTeamAHome ? match.awayScore : match.homeScore;

      acc.teamAGoalsFor += teamAScore;
      acc.teamAGoalsAgainst += teamBScore;
      acc.teamBGoalsFor += teamBScore;
      acc.teamBGoalsAgainst += teamAScore;

      if (teamAScore > teamBScore) acc.teamAPoints += 3;
      else if (teamBScore > teamAScore) acc.teamBPoints += 3;
      else {
        acc.teamAPoints += 1;
        acc.teamBPoints += 1;
      }

      return acc;
    },
    {
      teamAPoints: 0,
      teamBPoints: 0,
      teamAGoalsFor: 0,
      teamAGoalsAgainst: 0,
      teamBGoalsFor: 0,
      teamBGoalsAgainst: 0,
    },
  );

  if (summary.teamBPoints !== summary.teamAPoints) return summary.teamBPoints - summary.teamAPoints;

  const teamAGoalDiff = summary.teamAGoalsFor - summary.teamAGoalsAgainst;
  const teamBGoalDiff = summary.teamBGoalsFor - summary.teamBGoalsAgainst;
  if (teamBGoalDiff !== teamAGoalDiff) return teamBGoalDiff - teamAGoalDiff;

  if (summary.teamBGoalsFor !== summary.teamAGoalsFor) return summary.teamBGoalsFor - summary.teamAGoalsFor;

  return 0;
};

const compareTeamsByTable = (
  teamA: Team,
  teamB: Team,
  competition: Competition,
  matches: Match[] = [],
) => {
  const statsA = teamA.stats[competition];
  const statsB = teamB.stats[competition];
  const pointsA = statsA.wins * 3 + statsA.draws;
  const pointsB = statsB.wins * 3 + statsB.draws;
  if (pointsB !== pointsA) return pointsB - pointsA;

  const gdA = statsA.goalsFor - statsA.goalsAgainst;
  const gdB = statsB.goalsFor - statsB.goalsAgainst;
  if (gdB !== gdA) return gdB - gdA;

  if (statsB.goalsFor !== statsA.goalsFor) return statsB.goalsFor - statsA.goalsFor;

  if (competition === 'LEAGUE') {
    const headToHead = getHeadToHeadTiebreaker(teamA, teamB, competition, matches);
    if (headToHead !== 0) return headToHead;
  }

  if (teamB.historicalPoints !== teamA.historicalPoints) return teamB.historicalPoints - teamA.historicalPoints;
  if (teamB.overall !== teamA.overall) return teamB.overall - teamA.overall;
  return teamA.name.localeCompare(teamB.name);
};

export const sortTeamsByCompetitionTable = (
  teams: Team[],
  competition: Competition,
  matches: Match[] = [],
) => [...teams].sort((teamA, teamB) => compareTeamsByTable(teamA, teamB, competition, matches));

const sortTeamsByTable = (teams: Team[], competition: Competition, matches: Match[] = []) =>
  sortTeamsByCompetitionTable(teams, competition, matches);

export const buildRoundRobinSchedule = (
  teams: Team[],
  startWeek: number,
  competition: Competition,
  extras: Partial<Match> = {},
  doubleRound = true,
): Match[] => {
  const matches: Match[] = [];

  if (teams.length < 2) {
    return matches;
  }

  const teamIds = teams.map(team => team.id);
  if (teamIds.length % 2 !== 0) {
    teamIds.push(BYE_TEAM_ID);
  }

  const numRounds = teamIds.length - 1;
  const halfSize = teamIds.length / 2;
  let currentWeek = startWeek;

  const appendRound = (reverseHomeAway: boolean) => {
    for (let round = 0; round < numRounds; round++) {
      for (let index = 0; index < halfSize; index++) {
        const home = teamIds[index];
        const away = teamIds[teamIds.length - 1 - index];

        if (home !== BYE_TEAM_ID && away !== BYE_TEAM_ID) {
          matches.push(
            createMatch(
              reverseHomeAway ? away : home,
              reverseHomeAway ? home : away,
              currentWeek,
              competition,
              extras,
            ),
          );
        }
      }

      teamIds.splice(1, 0, teamIds.pop()!);
      currentWeek += 1;
    }
  };

  appendRound(false);
  if (doubleRound) {
    appendRound(true);
  }

  return matches;
};

const nextPowerOfTwo = (value: number) => {
  let result = 1;
  while (result < value) result *= 2;
  return result;
};

export const getKnockoutDurationWeeks = (teamCount: number) => {
  if (teamCount < 2) return 0;
  return Math.log2(nextPowerOfTwo(teamCount));
};

export const getKnockoutStageName = (roundSize: number) => {
  if (roundSize <= 2) return 'Final';
  if (roundSize === 4) return 'Semifinal';
  if (roundSize === 8) return 'Quartas de final';
  if (roundSize === 16) return 'Oitavas de final';
  return `Fase de ${roundSize}`;
};

const sortKnockoutSeeds = (teams: Team[]) => {
  return [...teams].sort((a, b) => {
    if (b.historicalPoints !== a.historicalPoints) return b.historicalPoints - a.historicalPoints;
    if (b.overall !== a.overall) return b.overall - a.overall;
    return a.name.localeCompare(b.name);
  });
};

export const createKnockoutRound = (
  teams: Team[],
  startWeek: number,
  competition: Competition,
  tournamentId: string,
  tournamentName: string,
  seasonYear: number,
): Match[] => {
  if (teams.length < 2) {
    return [];
  }

  const seededTeams = sortKnockoutSeeds(teams);
  const roundSize = nextPowerOfTwo(seededTeams.length);
  const paddedTeamIds = seededTeams.map(team => team.id);

  while (paddedTeamIds.length < roundSize) {
    paddedTeamIds.push(BYE_TEAM_ID);
  }

  const matches: Match[] = [];
  for (let index = 0; index < paddedTeamIds.length / 2; index++) {
    const homeTeamId = paddedTeamIds[index];
    const awayTeamId = paddedTeamIds[paddedTeamIds.length - 1 - index];

    matches.push(
      createMatch(homeTeamId, awayTeamId, startWeek, competition, {
        isKnockout: true,
        stage: getKnockoutStageName(roundSize),
        roundSize,
        tournamentId,
        tournamentName,
        seasonYear,
      }),
    );
  }

  return matches;
};

const uniqueTeams = (teams: Team[]) => {
  const seen = new Set<string>();
  return teams.filter(team => {
    if (seen.has(team.id)) return false;
    seen.add(team.id);
    return true;
  });
};

export const buildLeagueGroups = (clubTeams: Team[]) => {
  const groups = new Map<string, Team[]>();

  clubTeams.forEach(team => {
    const key = `${team.country}_DIV${team.division}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(team);
  });

  return [...groups.values()].filter(group => {
    if (group.length < 2) return false;
    const [reference] = group;
    return group.every(team => team.country === reference.country && team.division === reference.division);
  });
};

export const buildRegionalGroups = (clubTeams: Team[]) => {
  const groups = new Map<string, Team[]>();

  clubTeams
    .filter(team => team.state)
    .forEach(team => {
      const key = `${team.country}_${team.state}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(team);
    });

  return [...groups.entries()]
    .map(([key, teams]) => ({ key, teams }))
    .filter(({ teams }) => {
      if (teams.length < 2) return false;
      const [reference] = teams;
      return teams.every(team => team.country === reference.country && team.state === reference.state);
    });
};

export const buildNationalCupGroups = (clubTeams: Team[]) => {
  const groups = new Map<string, Team[]>();

  clubTeams.forEach(team => {
    if (!groups.has(team.country)) groups.set(team.country, []);
    groups.get(team.country)!.push(team);
  });

  return [...groups.entries()]
    .map(([country, teams]) => ({ country, teams }))
    .filter(({ teams }) => teams.length >= 2 && teams.every(team => team.country === teams[0].country));
};

const getLeagueStandingsByCountry = (teams: Team[], matches: Match[] = []) => {
  const standings = new Map<string, Team[]>();
  const divisionOneTeams = teams.filter(team => team.division === 1);

  divisionOneTeams.forEach(team => {
    if (!standings.has(team.country)) standings.set(team.country, []);
    standings.get(team.country)!.push(team);
  });

  return new Map(
    [...standings.entries()].map(([country, countryTeams]) => [country, sortTeamsByTable(countryTeams, 'LEAGUE', matches)]),
  );
};

const getNationalCupWinners = (teams: Team[]) => {
  const groups = new Map<string, Team[]>();

  teams.forEach(team => {
    if (!groups.has(team.country)) groups.set(team.country, []);
    groups.get(team.country)!.push(team);
  });

  return new Map(
    [...groups.entries()].map(([country, countryTeams]) => [
      country,
      [...countryTeams].sort((a, b) => {
        const winsDelta = b.stats.NATIONAL_CUP.wins - a.stats.NATIONAL_CUP.wins;
        if (winsDelta !== 0) return winsDelta;
        return sortTeamsByTable([a, b], 'LEAGUE')[0].id === a.id ? -1 : 1;
      })[0],
    ]),
  );
};

export const buildContinentalQualifiers = (
  clubTeams: Team[],
  qualificationSourceTeams: Team[],
  matches: Match[] = [],
) => {
  const standingsByCountry = getLeagueStandingsByCountry(qualificationSourceTeams, matches);
  const cupWinnersByCountry = getNationalCupWinners(qualificationSourceTeams);

  return PRIMARY_CONTINENTS.map(continent => {
    const countriesInContinent = uniqueTeams(
      clubTeams.filter(team => team.continent === continent && team.division > 0),
    ).map(team => team.country);

    const uniqueCountries = [...new Set(countriesInContinent)];
    const primaryPool: Team[] = [];
    const secondaryPool: Team[] = [];

    uniqueCountries.forEach(country => {
      const currentSeasonCountryTeams = clubTeams.filter(team => team.country === country);
      const currentSeasonTopFlightTeams = currentSeasonCountryTeams.filter(team => team.division === 1);
      const rankedTeams =
        standingsByCountry.get(country) || sortTeamsByTable(currentSeasonTopFlightTeams, 'LEAGUE', matches);
      const currentSeasonLookup = new Map(currentSeasonCountryTeams.map(team => [team.name, team]));

      const cupWinner = cupWinnersByCountry.get(country);
      const mappedCupWinner = cupWinner ? currentSeasonLookup.get(cupWinner.name) : undefined;
      if (mappedCupWinner && mappedCupWinner.division === 1) primaryPool.push(mappedCupWinner);

      rankedTeams.slice(0, 2).forEach(team => {
        const mappedTeam = currentSeasonLookup.get(team.name);
        if (mappedTeam && mappedTeam.division === 1) primaryPool.push(mappedTeam);
      });

      rankedTeams.slice(2, 4).forEach(team => {
        const mappedTeam = currentSeasonLookup.get(team.name);
        if (mappedTeam && mappedTeam.division === 1) secondaryPool.push(mappedTeam);
      });
    });

    const sortedPrimary = sortKnockoutSeeds(uniqueTeams(primaryPool));
    const sortedSecondary = sortKnockoutSeeds(
      uniqueTeams(secondaryPool.filter(team => !sortedPrimary.some(primary => primary.id === team.id))),
    );

    return {
      continent,
      primary: sortedPrimary,
      secondary: sortedSecondary,
    };
  });
};

export const getInternationalCompetitionsForYear = (year: number): Competition[] => {
  const competitions: Competition[] = [];

  if (year % 4 === 0) {
    competitions.push('WORLD_CUP');
    competitions.push('OLYMPICS');
  }

  return competitions;
};

export const getCompetitionPlayers = (team: Team, competition?: Competition) =>
  competition && team.competitionSquads?.[competition]?.length ? team.competitionSquads[competition]! : team.players;

const buildInternationalGroups = (teams: Team[], groupCount: number) => {
  const groups = Array.from({ length: groupCount }, () => [] as Team[]);
  const seededTeams = sortKnockoutSeeds(teams);

  seededTeams.forEach((team, index) => {
    const cycle = Math.floor(index / groupCount);
    const column = index % groupCount;
    const groupIndex = cycle % 2 === 0 ? column : groupCount - 1 - column;
    groups[groupIndex].push(team);
  });

  return groups;
};

export const buildInternationalGroupSchedule = (
  competition: Competition,
  teams: Team[],
  currentYear: number,
  startWeek: number,
) => {
  const tournamentId = `${competition}_${currentYear}`;
  const tournamentName = competition === 'WORLD_CUP' ? 'Copa do Mundo' : 'Olimpíadas';
  const groupCount = competition === 'WORLD_CUP' ? 8 : 4;
  const maxTeams = competition === 'WORLD_CUP' ? 32 : 16;
  const selectedTeams = sortKnockoutSeeds(teams).slice(0, maxTeams);
  const groups = buildInternationalGroups(selectedTeams, groupCount);
  const groupMatches: Match[] = [];

  groups.forEach((group, index) => {
    const groupName = `Grupo ${String.fromCharCode(65 + index)}`;
    const schedule = buildRoundRobinSchedule(
      group,
      startWeek,
      competition,
      {
        tournamentId,
        tournamentName,
        seasonYear: currentYear,
        stage: groupName,
        groupName,
      },
      false,
    );
    groupMatches.push(...schedule);
  });

  return groupMatches;
};

const getMatchFairPlayScore = (match: Match, teamId: string) => {
  return match.events.reduce((score, event) => {
    if (event.teamId !== teamId) return score;
    if (event.type === 'YELLOW_CARD') return score + 1;
    if (event.type === 'RED_CARD') return score + 3;
    return score;
  }, 0);
};

export const getGroupStandings = (groupMatches: Match[], teams: Team[]) => {
  const table = new Map<
    string,
    { team: Team; points: number; goalsFor: number; goalsAgainst: number; fairPlay: number }
  >();

  teams.forEach(team => {
    table.set(team.id, { team, points: 0, goalsFor: 0, goalsAgainst: 0, fairPlay: 0 });
  });

  groupMatches.filter(match => match.played).forEach(match => {
    const home = table.get(match.homeTeamId);
    const away = table.get(match.awayTeamId);
    if (!home || !away) return;

    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    home.fairPlay += getMatchFairPlayScore(match, match.homeTeamId);

    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;
    away.fairPlay += getMatchFairPlayScore(match, match.awayTeamId);

    if (match.homeScore > match.awayScore) {
      home.points += 3;
    } else if (match.awayScore > match.homeScore) {
      away.points += 3;
    } else {
      home.points += 1;
      away.points += 1;
    }
  });

  return [...table.values()]
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;

      const goalDifferenceA = a.goalsFor - a.goalsAgainst;
      const goalDifferenceB = b.goalsFor - b.goalsAgainst;
      if (goalDifferenceB !== goalDifferenceA) return goalDifferenceB - goalDifferenceA;

      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      if (a.fairPlay !== b.fairPlay) return a.fairPlay - b.fairPlay;
      return a.team.name.localeCompare(b.team.name);
    })
    .map(entry => entry.team);
};
