/**
 * Historical NFL Records - Used as baselines and constraints for realistic simulation
 * Records can be broken, but with very low probability (rare statistical outcomes)
 * Data sourced from NFL official records
 */

export interface NFLRecords {
  singleGame: {
    passing: {
      yards: number; // 554 (Norm Van Brocklin, 1951)
      touchdowns: number; // 7 (multiple players)
      completions: number; // 45 (Drew Brees, 2019)
      attempts: number; // 70 (Drew Bledsoe, 1994)
      interceptions: number; // 8 (multiple players)
    };
    rushing: {
      yards: number; // 296 (Adrian Peterson, 2007)
      touchdowns: number; // 6 (multiple players)
      attempts: number; // 45 (Jamal Lewis, 2003)
    };
    receiving: {
      yards: number; // 336 (Flipper Anderson, 1989)
      receptions: number; // 20 (Brandon Marshall, 2009)
      touchdowns: number; // 5 (multiple players)
    };
    defense: {
      tackles: number; // 24 (various)
      sacks: number; // 7 (Derrick Thomas, 1990)
      interceptions: number; // 4 (multiple players)
      passesDefended: number; // 8 (various)
    };
  };
  season: {
    passing: {
      yards: number; // 5,477 (Peyton Manning, 2013)
      touchdowns: number; // 55 (Peyton Manning, 2013)
      completions: number; // 471 (Drew Brees, 2016)
      attempts: number; // 727 (Matthew Stafford, 2012)
      interceptions: number; // 30 (George Blanda, 1962)
    };
    rushing: {
      yards: number; // 2,105 (Eric Dickerson, 1984)
      touchdowns: number; // 28 (Emmitt Smith, 1995)
      attempts: number; // 416 (Larry Johnson, 2006)
    };
    receiving: {
      yards: number; // 1,964 (Calvin Johnson, 2012)
      receptions: number; // 149 (Michael Thomas, 2019)
      touchdowns: number; // 23 (Randy Moss, 2007)
    };
    defense: {
      tackles: number; // 200 (various)
      sacks: number; // 22.5 (Michael Strahan, 2001)
      interceptions: number; // 14 (Dick Lane, 1952)
      passesDefended: number; // 30 (various)
    };
  };
  career: {
    passing: {
      yards: number; // 89,214 (Tom Brady)
      touchdowns: number; // 649 (Tom Brady)
      completions: number; // 7,753 (Tom Brady)
      attempts: number; // 12,050 (Tom Brady)
      interceptions: number; // 277 (Brett Favre)
    };
    rushing: {
      yards: number; // 18,355 (Emmitt Smith)
      touchdowns: number; // 164 (Emmitt Smith)
      attempts: number; // 4,409 (Emmitt Smith)
    };
    receiving: {
      yards: number; // 22,895 (Jerry Rice)
      receptions: number; // 1,549 (Jerry Rice)
      touchdowns: number; // 197 (Jerry Rice)
    };
    defense: {
      tackles: number; // 2,000+ (various)
      sacks: number; // 200 (Bruce Smith)
      interceptions: number; // 81 (Paul Krause)
      passesDefended: number; // 200+ (various)
    };
  };
  averages: {
    perGame: {
      passing: {
        yards: number; // ~250
        touchdowns: number; // ~1.5
        completions: number; // ~22
        attempts: number; // ~35
        interceptions: number; // ~0.8
      };
      rushing: {
        yards: number; // ~70
        touchdowns: number; // ~0.5
        attempts: number; // ~15
      };
      receiving: {
        yards: number; // ~60
        receptions: number; // ~4
        touchdowns: number; // ~0.4
      };
      defense: {
        tackles: number; // ~6
        sacks: number; // ~0.3
        interceptions: number; // ~0.1
        passesDefended: number; // ~0.5
      };
    };
    perSeason: {
      passing: {
        yards: number; // ~4,000
        touchdowns: number; // ~25
        completions: number; // ~350
        attempts: number; // ~550
        interceptions: number; // ~12
      };
      rushing: {
        yards: number; // ~1,200
        touchdowns: number; // ~10
        attempts: number; // ~250
      };
      receiving: {
        yards: number; // ~1,000
        receptions: number; // ~70
        touchdowns: number; // ~7
      };
      defense: {
        tackles: number; // ~100
        sacks: number; // ~10
        interceptions: number; // ~3
        passesDefended: number; // ~15
      };
    };
  };
  statDistributions: {
    passingYards: {
      mean: number;
      stdDev: number;
      p99_9: number; // 99.9th percentile
      record: number;
    };
    rushingYards: {
      mean: number;
      stdDev: number;
      p99_9: number;
      record: number;
    };
    receivingYards: {
      mean: number;
      stdDev: number;
      p99_9: number;
      record: number;
    };
    tackles: {
      mean: number;
      stdDev: number;
      p99_9: number;
      record: number;
    };
    sacks: {
      mean: number;
      stdDev: number;
      p99_9: number;
      record: number;
    };
  };
}

export const NFL_RECORDS: NFLRecords = {
  singleGame: {
    passing: {
      yards: 554,
      touchdowns: 7,
      completions: 45,
      attempts: 70,
      interceptions: 8,
    },
    rushing: {
      yards: 296,
      touchdowns: 6,
      attempts: 45,
    },
    receiving: {
      yards: 336,
      receptions: 20,
      touchdowns: 5,
    },
    defense: {
      tackles: 24,
      sacks: 7,
      interceptions: 4,
      passesDefended: 8,
    },
  },
  season: {
    passing: {
      yards: 5477,
      touchdowns: 55,
      completions: 471,
      attempts: 727,
      interceptions: 30,
    },
    rushing: {
      yards: 2105,
      touchdowns: 28,
      attempts: 416,
    },
    receiving: {
      yards: 1964,
      receptions: 149,
      touchdowns: 23,
    },
    defense: {
      tackles: 200,
      sacks: 22.5,
      interceptions: 14,
      passesDefended: 30,
    },
  },
  career: {
    passing: {
      yards: 89214,
      touchdowns: 649,
      completions: 7753,
      attempts: 12050,
      interceptions: 277,
    },
    rushing: {
      yards: 18355,
      touchdowns: 164,
      attempts: 4409,
    },
    receiving: {
      yards: 22895,
      receptions: 1549,
      touchdowns: 197,
    },
    defense: {
      tackles: 2000,
      sacks: 200,
      interceptions: 81,
      passesDefended: 200,
    },
  },
  averages: {
    perGame: {
      passing: {
        yards: 250,
        touchdowns: 1.5,
        completions: 22,
        attempts: 35,
        interceptions: 0.8,
      },
      rushing: {
        yards: 70,
        touchdowns: 0.5,
        attempts: 15,
      },
      receiving: {
        yards: 60,
        receptions: 4,
        touchdowns: 0.4,
      },
      defense: {
        tackles: 6,
        sacks: 0.3,
        interceptions: 0.1,
        passesDefended: 0.5,
      },
    },
    perSeason: {
      passing: {
        yards: 4000,
        touchdowns: 25,
        completions: 350,
        attempts: 550,
        interceptions: 12,
      },
      rushing: {
        yards: 1200,
        touchdowns: 10,
        attempts: 250,
      },
      receiving: {
        yards: 1000,
        receptions: 70,
        touchdowns: 7,
      },
      defense: {
        tackles: 100,
        sacks: 10,
        interceptions: 3,
        passesDefended: 15,
      },
    },
  },
  statDistributions: {
    passingYards: {
      mean: 250,
      stdDev: 80,
      p99_9: 500, // 99.9th percentile
      record: 554,
    },
    rushingYards: {
      mean: 70,
      stdDev: 40,
      p99_9: 250,
      record: 296,
    },
    receivingYards: {
      mean: 60,
      stdDev: 35,
      p99_9: 280,
      record: 336,
    },
    tackles: {
      mean: 6,
      stdDev: 3,
      p99_9: 18,
      record: 24,
    },
    sacks: {
      mean: 0.3,
      stdDev: 0.5,
      p99_9: 5,
      record: 7,
    },
  },
};

/**
 * Generate realistic game total using probability distribution
 * Allows rare record-breaking performances
 */
export function generateGameTotal(
  statType: 'passing' | 'rushing' | 'receiving',
  playerRating: number,
  teamStrength: number,
  opponentStrength: number
): number {
  const distKey = statType === 'passing' 
    ? 'passingYards' 
    : statType === 'rushing' 
    ? 'rushingYards' 
    : 'receivingYards';
  
  const dist = NFL_RECORDS.statDistributions[distKey];
  
  // Adjust mean based on player and team ratings
  const ratingMultiplier = (playerRating / 50) * (teamStrength / 50);
  const adjustedMean = dist.mean * ratingMultiplier;
  
  // Use Box-Muller transform for normal distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  
  // Generate value with normal distribution
  let value = adjustedMean + (z * dist.stdDev);
  
  // Rare record-breaking: if in extreme tail (top 0.1%), allow record break
  const recordBreakThreshold = dist.record * 0.95; // 95% of record
  if (value >= recordBreakThreshold) {
    // 5% chance of breaking record when near threshold
    if (Math.random() < 0.05) {
      // Break record by 0-10%
      const recordMultiplier = 1 + (Math.random() * 0.1);
      value = dist.record * recordMultiplier;
    } else {
      // Cap at threshold if not breaking record
      value = Math.min(value, dist.record * 0.99);
    }
  }
  
  // Ensure minimum of 0
  return Math.max(0, Math.round(value));
}

/**
 * Check if a stat breaks a record and log it
 */
export function checkRecordBreak(
  statType: string,
  value: number,
  record: number,
  playerName: string,
  context: 'game' | 'season'
): { brokeRecord: boolean; newRecord?: number } {
  if (value > record) {
    const newRecord = value;
    console.log(
      `🏆 RECORD BREAKING PERFORMANCE! ${playerName} broke the ${context} ${statType} record: ${record} → ${newRecord}`
    );
    return { brokeRecord: true, newRecord };
  }
  return { brokeRecord: false };
}

/**
 * Get realistic distribution parameters for a stat
 */
export function getRealisticDistribution(
  statType: string
): { mean: number; stdDev: number; min: number; max: number } {
  const dist = NFL_RECORDS.statDistributions[
    statType as keyof typeof NFL_RECORDS.statDistributions
  ];
  
  if (!dist) {
    return { mean: 0, stdDev: 1, min: 0, max: 100 };
  }
  
  return {
    mean: dist.mean,
    stdDev: dist.stdDev,
    min: 0,
    max: dist.record * 1.1, // Allow up to 10% over record for rare cases
  };
}

