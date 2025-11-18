import { supabase } from "@/lib/supabase-client";

export interface PlayoffTeam {
  teamId: string;
  teamName: string;
  seed: number;
  conference: string;
  division: string;
  wins: number;
  losses: number;
  ties: number;
  winPercentage: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface PlayoffBracket {
  wildCard: PlayoffGame[];
  divisional: PlayoffGame[];
  conferenceChampionship: PlayoffGame[];
  superBowl: PlayoffGame | null;
}

export interface PlayoffGame {
  id: string;
  week: number;
  round: "wild_card" | "divisional" | "conference_championship" | "super_bowl";
  conference: string | null; // null for Super Bowl
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamSeed: number | null;
  awayTeamSeed: number | null;
  homeScore: number | null;
  awayScore: number | null;
  played: boolean;
  winnerId: string | null;
}

/**
 * Calculate playoff seeds based on standings
 * NFL Playoff Format:
 * - 7 teams per conference (14 total)
 * - 4 division winners (seeds 1-4)
 * - 3 wild cards (seeds 5-7)
 */
export async function calculatePlayoffSeeds(season: number): Promise<{
  afc: PlayoffTeam[];
  nfc: PlayoffTeam[];
}> {
  // Get all teams with their standings
  const { data: seasonData } = await supabase
    .from("seasons")
    .select("id")
    .eq("year", season)
    .single();

  let standings: any[] = [];

  if (seasonData) {
    const { data: statsData } = await supabase
      .from("team_season_stats")
      .select(
        `
        *,
        teams!inner (id, name, abbreviation, conference, division)
        `
      )
      .eq("season_id", seasonData.id);

    if (statsData && statsData.length > 0) {
      standings = statsData;
    }
  }

  // If no stats, calculate from games
  if (standings.length === 0) {
    const { data: games } = await supabase
      .from("games")
      .select("home_team_id, away_team_id, home_score, away_score")
      .eq("season", season)
      .eq("played", true);

    const { data: teams } = await supabase
      .from("teams")
      .select("id, name, abbreviation, conference, division");

    if (!teams || !games) {
      throw new Error("Failed to load teams or games");
    }

    const teamStatsMap = new Map<string, any>();

    teams.forEach(team => {
      teamStatsMap.set(team.id, {
        team_id: team.id,
        team: team,
        wins: 0,
        losses: 0,
        ties: 0,
        points_for: 0,
        points_against: 0,
      });
    });

    games.forEach(game => {
      if (!game.home_score || !game.away_score) return;

      const homeStat = teamStatsMap.get(game.home_team_id)!;
      const awayStat = teamStatsMap.get(game.away_team_id)!;

      homeStat.points_for += game.home_score;
      homeStat.points_against += game.away_score;
      awayStat.points_for += game.away_score;
      awayStat.points_against += game.home_score;

      if (game.home_score > game.away_score) {
        homeStat.wins += 1;
        awayStat.losses += 1;
      } else if (game.home_score < game.away_score) {
        homeStat.losses += 1;
        awayStat.wins += 1;
      } else {
        homeStat.ties += 1;
        awayStat.ties += 1;
      }
    });

    standings = Array.from(teamStatsMap.values());
  }

  // Separate by conference
  const afcTeams: PlayoffTeam[] = [];
  const nfcTeams: PlayoffTeam[] = [];

  standings.forEach(stat => {
    const team = stat.teams || stat.team;
    const gamesPlayed = stat.wins + stat.losses + stat.ties;
    const winPercentage = gamesPlayed > 0 
      ? (stat.wins + (stat.ties * 0.5)) / gamesPlayed 
      : 0;

    const playoffTeam: PlayoffTeam = {
      teamId: team.id,
      teamName: team.name,
      seed: 0, // Will be assigned
      conference: team.conference,
      division: team.division,
      wins: stat.wins,
      losses: stat.losses,
      ties: stat.ties,
      winPercentage,
      pointsFor: stat.points_for || 0,
      pointsAgainst: stat.points_against || 0,
    };

    if (team.conference === "AFC") {
      afcTeams.push(playoffTeam);
    } else {
      nfcTeams.push(playoffTeam);
    }
  });

  // Calculate seeds for each conference
  const seedConference = (teams: PlayoffTeam[]): PlayoffTeam[] => {
    // Sort by division
    const divisions = new Map<string, PlayoffTeam[]>();
    teams.forEach(team => {
      const key = `${team.conference}-${team.division}`;
      if (!divisions.has(key)) {
        divisions.set(key, []);
      }
      divisions.get(key)!.push(team);
    });

    // Find division winners (seeds 1-4)
    const divisionWinners: PlayoffTeam[] = [];
    divisions.forEach((divTeams, key) => {
      divTeams.sort((a, b) => {
        // Primary: Win percentage (accounts for ties properly)
        const wpDiff = b.winPercentage - a.winPercentage;
        if (Math.abs(wpDiff) > 0.001) {
          return wpDiff > 0 ? 1 : -1;
        }
        
        // Secondary: Point differential
        const aDiff = a.pointsFor - a.pointsAgainst;
        const bDiff = b.pointsFor - b.pointsAgainst;
        if (aDiff !== bDiff) {
          return bDiff - aDiff;
        }
        
        // Tertiary: Points scored
        if (a.pointsFor !== b.pointsFor) {
          return b.pointsFor - a.pointsFor;
        }
        
        // Final: Random (coin flip)
        return Math.random() < 0.5 ? -1 : 1;
      });
      divisionWinners.push(divTeams[0]);
    });

    // Sort division winners by record (seeds 1-4)
    divisionWinners.sort((a, b) => {
      // Primary: Win percentage
      const wpDiff = b.winPercentage - a.winPercentage;
      if (Math.abs(wpDiff) > 0.001) {
        return wpDiff > 0 ? 1 : -1;
      }
      
      // Secondary: Point differential
      const aDiff = a.pointsFor - a.pointsAgainst;
      const bDiff = b.pointsFor - b.pointsAgainst;
      if (aDiff !== bDiff) {
        return bDiff - aDiff;
      }
      
      // Tertiary: Points scored
      if (a.pointsFor !== b.pointsFor) {
        return b.pointsFor - a.pointsFor;
      }
      
      // Final: Random (coin flip)
      return Math.random() < 0.5 ? -1 : 1;
    });

    // Assign seeds 1-4 to division winners
    divisionWinners.forEach((team, index) => {
      team.seed = index + 1;
    });

    // Find wild cards (seeds 5-7) - teams not division winners
    const wildCards = teams.filter(team => 
      !divisionWinners.some(winner => winner.teamId === team.teamId)
    );

    // Sort wild cards by record with proper tiebreakers
    // CLE (10-6) should be ahead of NE (10-7) because 10-6 has better win percentage
    wildCards.sort((a, b) => {
      // Primary: Win percentage (accounts for ties properly)
      const wpDiff = b.winPercentage - a.winPercentage;
      if (Math.abs(wpDiff) > 0.001) {
        return wpDiff > 0 ? 1 : -1;
      }
      
      // Secondary: Point differential
      const aDiff = a.pointsFor - a.pointsAgainst;
      const bDiff = b.pointsFor - b.pointsAgainst;
      if (aDiff !== bDiff) {
        return bDiff - aDiff;
      }
      
      // Tertiary: Points scored
      if (a.pointsFor !== b.pointsFor) {
        return b.pointsFor - a.pointsFor;
      }
      
      // Final: Random (coin flip)
      return Math.random() < 0.5 ? -1 : 1;
    });

    // Assign seeds 5-7 to wild cards
    wildCards.forEach((team, index) => {
      team.seed = index + 5;
    });

    // Combine and return (only top 7)
    return [...divisionWinners, ...wildCards.slice(0, 3)];
  };

  return {
    afc: seedConference(afcTeams),
    nfc: seedConference(nfcTeams),
  };
}

/**
 * Create playoff bracket games
 */
export async function createPlayoffBracket(
  season: number,
  afcTeams: PlayoffTeam[],
  nfcTeams: PlayoffTeam[]
): Promise<PlayoffBracket> {
  const bracket: PlayoffBracket = {
    wildCard: [],
    divisional: [],
    conferenceChampionship: [],
    superBowl: null,
  };

  // Wild Card Round (Week 19)
  // AFC: 2 vs 7, 3 vs 6, 4 vs 5
  // NFC: 2 vs 7, 3 vs 6, 4 vs 5
  const wildCardGames: PlayoffGame[] = [];

  [afcTeams, nfcTeams].forEach((teams, confIndex) => {
    const conference = confIndex === 0 ? "AFC" : "NFC";
    const sortedTeams = teams.sort((a, b) => a.seed - b.seed);

    // Game 1: 2 vs 7 (2 is home)
    wildCardGames.push({
      id: `wc-${conference.toLowerCase()}-1`,
      week: 19,
      round: "wild_card",
      conference,
      homeTeamId: sortedTeams.find(t => t.seed === 2)?.teamId || null,
      awayTeamId: sortedTeams.find(t => t.seed === 7)?.teamId || null,
      homeTeamSeed: 2,
      awayTeamSeed: 7,
      homeScore: null,
      awayScore: null,
      played: false,
      winnerId: null,
    });

    // Game 2: 3 vs 6 (3 is home)
    wildCardGames.push({
      id: `wc-${conference.toLowerCase()}-2`,
      week: 19,
      round: "wild_card",
      conference,
      homeTeamId: sortedTeams.find(t => t.seed === 3)?.teamId || null,
      awayTeamId: sortedTeams.find(t => t.seed === 6)?.teamId || null,
      homeTeamSeed: 3,
      awayTeamSeed: 6,
      homeScore: null,
      awayScore: null,
      played: false,
      winnerId: null,
    });

    // Game 3: 4 vs 5 (4 is home)
    wildCardGames.push({
      id: `wc-${conference.toLowerCase()}-3`,
      week: 19,
      round: "wild_card",
      conference,
      homeTeamId: sortedTeams.find(t => t.seed === 4)?.teamId || null,
      awayTeamId: sortedTeams.find(t => t.seed === 5)?.teamId || null,
      homeTeamSeed: 4,
      awayTeamSeed: 5,
      homeScore: null,
      awayScore: null,
      played: false,
      winnerId: null,
    });
  });

  bracket.wildCard = wildCardGames;

  // Divisional Round (Week 20) - will be created after Wild Card
  // Conference Championship (Week 21) - will be created after Divisional
  // Super Bowl (Week 22) - will be created after Conference Championship

  return bracket;
}

