import { Player, Play, TeamWithRoster, PlayerGameStat } from './types';
import { getBestPlayerAtPosition } from './team-strength';
import { checkRecordBreak, NFL_RECORDS } from './nfl-records';

/**
 * Track player statistics during game simulation
 */
export class PlayerStatsTracker {
  private stats: Map<string, PlayerGameStat> = new Map();

  constructor(
    private homeTeam: TeamWithRoster,
    private awayTeam: TeamWithRoster,
    private gameId: string,
    private season: number,
    private week: number
  ) {
    // Initialize stats for all players
    this.initializePlayerStats(homeTeam);
    this.initializePlayerStats(awayTeam);
  }

  /**
   * Initialize stats for all players on a team
   */
  private initializePlayerStats(team: TeamWithRoster): void {
    team.players.forEach(player => {
      this.stats.set(player.id, {
        player_id: player.id,
        game_id: this.gameId,
        team_id: team.id,
        season: this.season,
        week: this.week,
        // Initialize all stat fields to 0
        passing_yards: 0,
        passing_tds: 0,
        interceptions: 0, // Offensive (QB throwing picks)
        defensive_interceptions: 0, // Defensive (defenders catching picks)
        completions: 0,
        attempts: 0,
        rushing_yards: 0,
        rushing_tds: 0,
        rushing_attempts: 0,
        receiving_yards: 0,
        receiving_tds: 0,
        receptions: 0,
        targets: 0,
        fumbles: 0,
        tackles: 0,
        solo_tackles: 0,
        sacks: 0,
        forced_fumbles: 0,
        fumble_recoveries: 0,
        passes_defended: 0,
        tfl: 0,
        field_goals_made: 0,
        field_goals_attempted: 0,
        extra_points_made: 0,
        punts: 0,
        punt_yards: 0,
        snaps_played: 0,
      });
    });
  }

  /**
   * Record a play and update player stats
   */
  recordPlay(
    play: Play,
    offense: TeamWithRoster,
    defense: TeamWithRoster,
    isHomeTeam: boolean
  ): void {
    // Get key players
    const qb = getBestPlayerAtPosition(offense, 'QB');
    const rb = getBestPlayerAtPosition(offense, 'RB');
    const receivers = offense.players
      .filter(p => p.position === 'WR' || p.position === 'TE')
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 3);

    // Update offensive player stats
    if (play.playType === 'pass') {
      this.recordPassPlay(play, qb, receivers, offense);
    } else if (play.playType === 'run') {
      this.recordRunPlay(play, qb, rb, offense);
    } else if (play.playType === 'field_goal') {
      this.recordFieldGoal(play, offense);
    }

    // Update defensive player stats
    this.recordDefensivePlay(play, defense);

    // Update snap counts for players involved
    if (qb) this.incrementSnaps(qb.id);
    if (rb && play.playType === 'run') this.incrementSnaps(rb.id);
    receivers.forEach(wr => {
      if (play.playType === 'pass') this.incrementSnaps(wr.id);
    });
    
    // Update snap counts for defensive players involved in the play
    const defenders = defense.players.filter(
      p => ['DE', 'DT', 'LB', 'CB', 'S'].includes(p.position)
    );
    // Give snaps to 3-5 defensive players per play (realistic distribution)
    const numDefendersWithSnaps = Math.floor(Math.random() * 3) + 3; // 3-5 players
    const defendersWithSnaps = this.selectRandomPlayers(defenders, numDefendersWithSnaps);
    defendersWithSnaps.forEach(defender => {
      this.incrementSnaps(defender.id);
    });
  }

  /**
   * Record a passing play
   */
  private recordPassPlay(
    play: Play,
    qb: Player | null,
    receivers: Player[],
    offense: TeamWithRoster
  ): void {
    if (!qb) return;

    const qbStats = this.getStats(qb.id);
    qbStats.attempts = (qbStats.attempts || 0) + 1;

    if (play.success && play.yards > 0) {
      // Complete pass
      qbStats.completions = (qbStats.completions || 0) + 1;
      qbStats.passing_yards = (qbStats.passing_yards || 0) + play.yards;

      // Distribute to receiver (primary target)
      if (receivers.length > 0) {
        const target = receivers[Math.floor(Math.random() * receivers.length)];
        const wrStats = this.getStats(target.id);
        wrStats.receptions = (wrStats.receptions || 0) + 1;
        wrStats.targets = (wrStats.targets || 0) + 1;
        wrStats.receiving_yards = (wrStats.receiving_yards || 0) + play.yards;

        // Check for touchdown
        if (play.points > 0) {
          qbStats.passing_tds = (qbStats.passing_tds || 0) + 1;
          wrStats.receiving_tds = (wrStats.receiving_tds || 0) + 1;
        }
      }
    } else if (play.turnover && play.playType === 'pass') {
      // Interception
      qbStats.interceptions = (qbStats.interceptions || 0) + 1;
    }

    // Check for fumble
    if (play.turnover && play.playType === 'run') {
      if (qb) {
        const qbStats = this.getStats(qb.id);
        qbStats.fumbles = (qbStats.fumbles || 0) + 1;
      }
    }
  }

  /**
   * Record a running play
   */
  private recordRunPlay(
    play: Play,
    qb: Player | null,
    rb: Player | null,
    offense: TeamWithRoster
  ): void {
    if (!rb) return;

    const rbStats = this.getStats(rb.id);
    rbStats.rushing_attempts = (rbStats.rushing_attempts || 0) + 1;

    if (play.yards > 0) {
      rbStats.rushing_yards = (rbStats.rushing_yards || 0) + play.yards;

      // Check for touchdown
      if (play.points > 0) {
        rbStats.rushing_tds = (rbStats.rushing_tds || 0) + 1;
      }
    }

    // Check for fumble
    if (play.turnover && play.playType === 'run') {
      rbStats.fumbles = (rbStats.fumbles || 0) + 1;
    }
  }

  /**
   * Record a field goal attempt
   */
  private recordFieldGoal(play: Play, offense: TeamWithRoster): void {
    const kicker = getBestPlayerAtPosition(offense, 'K');
    if (!kicker) return;

    const kStats = this.getStats(kicker.id);
    kStats.field_goals_attempted = (kStats.field_goals_attempted || 0) + 1;

    if (play.success && play.points > 0) {
      kStats.field_goals_made = (kStats.field_goals_made || 0) + 1;
    }
  }

  /**
   * Record defensive play statistics
   */
  private recordDefensivePlay(play: Play, defense: TeamWithRoster): void {
    // Randomly assign defensive stats to defensive players
    const defenders = defense.players.filter(
      p => ['DE', 'DT', 'LB', 'CB', 'S'].includes(p.position)
    );

    if (defenders.length === 0) return;

    // Tackles happen on almost every play - someone makes the tackle
    // Distribute tackles more realistically across multiple defenders
    if (play.playType === 'run') {
      // Running plays: 1-2 tacklers
      const numTacklers = Math.random() < 0.7 ? 1 : 2;
      const tacklers = this.selectRandomPlayers(defenders, numTacklers);
      tacklers.forEach((tackler, index) => {
        const stats = this.getStats(tackler.id);
        stats.tackles = (stats.tackles || 0) + 1;
        // First tackler gets solo, second gets assist
        if (index === 0) {
          stats.solo_tackles = (stats.solo_tackles || 0) + 1;
        }
      });
    } else if (play.playType === 'pass') {
      // Passing plays: tackle on completion, or pass defended on incompletion
      if (play.success && play.yards > 0) {
        // Completed pass - someone makes the tackle after the catch
        const tackler = defenders[Math.floor(Math.random() * defenders.length)];
        const stats = this.getStats(tackler.id);
        stats.tackles = (stats.tackles || 0) + 1;
        stats.solo_tackles = (stats.solo_tackles || 0) + 1;
      } else if (!play.success) {
        // Incomplete pass - could be pass defended or just incomplete
        if (play.yards === 0 && Math.random() < 0.3) {
          // 30% chance of pass defended on incomplete pass
          const dbDefenders = defenders.filter(p => ['CB', 'S'].includes(p.position));
          if (dbDefenders.length > 0) {
            const defender = dbDefenders[Math.floor(Math.random() * dbDefenders.length)];
            const stats = this.getStats(defender.id);
            stats.passes_defended = (stats.passes_defended || 0) + 1;
          }
        }
      }
    }

    // Sack on failed pass play with negative yards OR incomplete pass (sack can happen without negative yards)
    if (play.playType === 'pass' && (!play.success || play.yards < 0)) {
      // Check if this was a sack (negative yards or failed pass)
      if (play.yards < 0 || (!play.success && Math.random() < 0.4)) {
        const passRushers = defenders.filter(p => ['DE', 'DT', 'LB'].includes(p.position));
        if (passRushers.length > 0) {
          const passRusher = passRushers[Math.floor(Math.random() * passRushers.length)];
          const stats = this.getStats(passRusher.id);
          // Full sack (not half)
          stats.sacks = (stats.sacks || 0) + 1;
          stats.tfl = (stats.tfl || 0) + 1;
          // Sack also counts as a tackle
          stats.tackles = (stats.tackles || 0) + 1;
          stats.solo_tackles = (stats.solo_tackles || 0) + 1;
        }
      }
    }

    // Interception
    if (play.turnover && play.playType === 'pass') {
      const interceptors = defenders.filter(p => ['CB', 'S', 'LB'].includes(p.position));
      if (interceptors.length > 0) {
        const interceptor = interceptors[Math.floor(Math.random() * interceptors.length)];
        const stats = this.getStats(interceptor.id);
        stats.defensive_interceptions = (stats.defensive_interceptions || 0) + 1;
        // Interception also counts as a tackle if returned
        stats.tackles = (stats.tackles || 0) + 1;
        stats.solo_tackles = (stats.solo_tackles || 0) + 1;
      }
    }

    // Fumble recovery
    if (play.turnover && play.playType === 'run') {
      const recoverer = defenders[Math.floor(Math.random() * defenders.length)];
      const stats = this.getStats(recoverer.id);
      stats.fumble_recoveries = (stats.fumble_recoveries || 0) + 1;
      // Fumble recovery also counts as a tackle
      stats.tackles = (stats.tackles || 0) + 1;
      stats.solo_tackles = (stats.solo_tackles || 0) + 1;
    }

    // Forced fumble (can happen on any play with a turnover)
    if (play.turnover && Math.random() < 0.5) {
      const forcers = defenders.filter(p => ['DE', 'DT', 'LB'].includes(p.position));
      if (forcers.length > 0) {
        const forcer = forcers[Math.floor(Math.random() * forcers.length)];
        const stats = this.getStats(forcer.id);
        stats.forced_fumbles = (stats.forced_fumbles || 0) + 1;
      }
    }

    // TFL (Tackle for Loss) on running plays with negative yards
    if (play.playType === 'run' && play.yards < 0) {
      const tflPlayers = defenders.filter(p => ['DE', 'DT', 'LB'].includes(p.position));
      if (tflPlayers.length > 0) {
        const tflPlayer = tflPlayers[Math.floor(Math.random() * tflPlayers.length)];
        const stats = this.getStats(tflPlayer.id);
        stats.tfl = (stats.tfl || 0) + 1;
      }
    }
  }

  /**
   * Select random players from an array
   */
  private selectRandomPlayers(players: Player[], count: number): Player[] {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, players.length));
  }

  /**
   * Increment snap count for a player
   */
  private incrementSnaps(playerId: string): void {
    const stats = this.getStats(playerId);
    stats.snaps_played = (stats.snaps_played || 0) + 1;
  }

  /**
   * Get stats for a player (create if doesn't exist)
   */
  private getStats(playerId: string): PlayerGameStat {
    if (!this.stats.has(playerId)) {
      // This shouldn't happen, but handle it gracefully
      const team = this.homeTeam.players.find(p => p.id === playerId)
        ? this.homeTeam
        : this.awayTeam;
      this.stats.set(playerId, {
        player_id: playerId,
        game_id: this.gameId,
        team_id: team.id,
        season: this.season,
        week: this.week,
      });
    }
    return this.stats.get(playerId)!;
  }

  /**
   * Get all player stats
   */
  getAllStats(): PlayerGameStat[] {
    return Array.from(this.stats.values());
  }

  /**
   * Get stats for players who actually played (snaps > 0 OR have any stats > 0)
   */
  getActivePlayerStats(): PlayerGameStat[] {
    return this.getAllStats().filter(stats => {
      const hasSnaps = (stats.snaps_played || 0) > 0;
      // Also include players with any stats, even if snaps are 0 (defensive players might not have snaps tracked)
      const hasStats = 
        (stats.passing_yards || 0) > 0 ||
        (stats.rushing_yards || 0) > 0 ||
        (stats.receiving_yards || 0) > 0 ||
        (stats.tackles || 0) > 0 ||
        (stats.sacks || 0) > 0 ||
        (stats.defensive_interceptions || 0) > 0 ||
        (stats.field_goals_made || 0) > 0 ||
        (stats.punts || 0) > 0;
      return hasSnaps || hasStats;
    });
  }

  /**
   * Validate and log record-breaking performances after game
   */
  validateAndLogRecords(): void {
    const allPlayers = [...this.homeTeam.players, ...this.awayTeam.players];
    const playerMap = new Map(allPlayers.map(p => [p.id, p]));

    for (const [playerId, stats] of this.stats.entries()) {
      const player = playerMap.get(playerId);
      if (!player) continue;

      // Check single-game passing records
      if (stats.passing_yards && stats.passing_yards > 0) {
        checkRecordBreak(
          'passing_yards',
          stats.passing_yards,
          NFL_RECORDS.singleGame.passing.yards,
          player.full_name,
          'game'
        );
      }

      if (stats.passing_tds && stats.passing_tds > NFL_RECORDS.singleGame.passing.touchdowns) {
        checkRecordBreak(
          'passing_touchdowns',
          stats.passing_tds,
          NFL_RECORDS.singleGame.passing.touchdowns,
          player.full_name,
          'game'
        );
      }

      if (stats.completions && stats.completions > NFL_RECORDS.singleGame.passing.completions) {
        checkRecordBreak(
          'completions',
          stats.completions,
          NFL_RECORDS.singleGame.passing.completions,
          player.full_name,
          'game'
        );
      }

      // Check single-game rushing records
      if (stats.rushing_yards && stats.rushing_yards > 0) {
        checkRecordBreak(
          'rushing_yards',
          stats.rushing_yards,
          NFL_RECORDS.singleGame.rushing.yards,
          player.full_name,
          'game'
        );
      }

      if (stats.rushing_tds && stats.rushing_tds > NFL_RECORDS.singleGame.rushing.touchdowns) {
        checkRecordBreak(
          'rushing_touchdowns',
          stats.rushing_tds,
          NFL_RECORDS.singleGame.rushing.touchdowns,
          player.full_name,
          'game'
        );
      }

      // Check single-game receiving records
      if (stats.receiving_yards && stats.receiving_yards > 0) {
        checkRecordBreak(
          'receiving_yards',
          stats.receiving_yards,
          NFL_RECORDS.singleGame.receiving.yards,
          player.full_name,
          'game'
        );
      }

      if (stats.receptions && stats.receptions > NFL_RECORDS.singleGame.receiving.receptions) {
        checkRecordBreak(
          'receptions',
          stats.receptions,
          NFL_RECORDS.singleGame.receiving.receptions,
          player.full_name,
          'game'
        );
      }

      // Check single-game defensive records
      if (stats.tackles && stats.tackles > NFL_RECORDS.singleGame.defense.tackles) {
        checkRecordBreak(
          'tackles',
          stats.tackles,
          NFL_RECORDS.singleGame.defense.tackles,
          player.full_name,
          'game'
        );
      }

      const sacksValue = typeof stats.sacks === 'string' ? parseFloat(stats.sacks) : (stats.sacks || 0);
      if (sacksValue > NFL_RECORDS.singleGame.defense.sacks) {
        checkRecordBreak(
          'sacks',
          sacksValue,
          NFL_RECORDS.singleGame.defense.sacks,
          player.full_name,
          'game'
        );
      }

      if (stats.defensive_interceptions && stats.defensive_interceptions > NFL_RECORDS.singleGame.defense.interceptions) {
        checkRecordBreak(
          'defensive_interceptions',
          stats.defensive_interceptions,
          NFL_RECORDS.singleGame.defense.interceptions,
          player.full_name,
          'game'
        );
      }
    }
  }
}

