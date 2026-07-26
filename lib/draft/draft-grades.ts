// @ts-nocheck
/**
 * Draft Grades & Analysis System
 * Generates grades, analysis, and retrospectives for draft picks
 */

import { getPickValue, checkReach, checkProspectFalling, DraftProspect, DraftPick } from "./draft-utils";

export interface PickGrade {
  pickNumber: number;
  round: number;
  teamId: string;
  teamName: string;
  prospectId: string;
  prospectName: string;
  position: string;

  // Grades (A+ to F)
  overallGrade: string;
  valueGrade: string;     // How good was the value?
  needGrade: string;      // Did it fill a need?
  talentGrade: string;    // How talented is the player?

  // Numeric scores (0-100)
  overallScore: number;
  valueScore: number;
  needScore: number;
  talentScore: number;

  // Analysis
  headline: string;
  analysis: string;
  comparisons?: string[];
  concerns?: string[];
  upside?: string;

  // Metadata
  consensusRank: number;
  pickDiff: number;       // Positive = reach, negative = value
  isReach: boolean;
  isSteal: boolean;
  timestamp: Date;
}

export interface TeamDraftGrade {
  teamId: string;
  teamName: string;
  overallGrade: string;
  overallScore: number;

  // Category grades
  valueGrade: string;
  needGrade: string;
  talentGrade: string;

  picks: PickGrade[];

  // Summary stats
  totalPicks: number;
  bestPick?: PickGrade;
  worstPick?: PickGrade;

  // Analysis
  summary: string;
  strengths: string[];
  weaknesses: string[];
  mvp?: string;           // Most valuable pick narrative
}

export interface DraftClassGrade {
  draftYear: number;
  totalPicks: number;

  teamGrades: TeamDraftGrade[];

  // Superlatives
  bestDraft: { teamId: string; teamName: string; grade: string };
  worstDraft: { teamId: string; teamName: string; grade: string };
  bestPick: PickGrade;
  biggestReach: PickGrade;
  biggestSteal: PickGrade;

  // Position analysis
  positionBreakdown: Record<string, { count: number; avgPick: number }>;

  // Round-by-round
  roundAnalysis: { round: number; avgScore: number; topPick: PickGrade }[];
}

// Grade conversion
function scoreToGrade(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 85) return "A-";
  if (score >= 80) return "B+";
  if (score >= 75) return "B";
  if (score >= 70) return "B-";
  if (score >= 65) return "C+";
  if (score >= 60) return "C";
  if (score >= 55) return "C-";
  if (score >= 50) return "D+";
  if (score >= 45) return "D";
  if (score >= 40) return "D-";
  return "F";
}

function gradeToScore(grade: string): number {
  const gradeMap: Record<string, number> = {
    "A+": 97, "A": 93, "A-": 88,
    "B+": 83, "B": 78, "B-": 73,
    "C+": 68, "C": 63, "C-": 58,
    "D+": 53, "D": 48, "D-": 43,
    "F": 35,
  };
  return gradeMap[grade] || 50;
}

// Grade colors for UI
export function getGradeColor(grade: string): { bg: string; text: string; border: string } {
  if (grade.startsWith("A")) {
    return { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" };
  }
  if (grade.startsWith("B")) {
    return { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" };
  }
  if (grade.startsWith("C")) {
    return { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300" };
  }
  if (grade.startsWith("D")) {
    return { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" };
  }
  return { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" };
}

// Calculate value score based on where player was taken vs consensus
function calculateValueScore(pickNumber: number, consensusRank: number): number {
  const diff = consensusRank - pickNumber;

  // Positive diff = value (taken later than consensus)
  // Negative diff = reach (taken earlier than consensus)

  if (diff >= 20) return 100;      // Major steal
  if (diff >= 15) return 95;       // Big value
  if (diff >= 10) return 88;       // Good value
  if (diff >= 5) return 80;        // Slight value
  if (diff >= -5) return 72;       // Fair pick
  if (diff >= -10) return 60;      // Slight reach
  if (diff >= -15) return 48;      // Reach
  if (diff >= -20) return 35;      // Big reach
  return 25;                        // Major reach
}

// Calculate need score
function calculateNeedScore(
  position: string,
  teamNeeds: string[],
  pickNumber: number
): number {
  const needIndex = teamNeeds.indexOf(position);

  if (needIndex === -1) {
    // Not a need - penalty scales with round
    const round = Math.ceil(pickNumber / 32);
    return Math.max(30, 70 - (round * 5));
  }

  // Higher score for addressing top needs
  if (needIndex === 0) return 100;  // Top need
  if (needIndex === 1) return 92;   // 2nd need
  if (needIndex === 2) return 85;   // 3rd need
  if (needIndex <= 4) return 78;    // Top 5 need
  return 70;                         // A need, but not urgent
}

// Calculate talent score based on overall rating and potential
function calculateTalentScore(
  prospect: DraftProspect,
  pickNumber: number
): number {
  // Use scouted data if available, otherwise estimate from consensus
  const estimatedOverall = prospect.scoutedOverall
    ? (prospect.scoutedOverall.low + prospect.scoutedOverall.high) / 2
    : Math.max(60, 95 - (prospect.consensusRank * 0.3));

  const estimatedPotential = prospect.scoutedPotential
    ? (prospect.scoutedPotential.low + prospect.scoutedPotential.high) / 2
    : Math.max(65, 98 - (prospect.consensusRank * 0.25));

  // Weighted average favoring potential slightly
  return Math.round((estimatedOverall * 0.4) + (estimatedPotential * 0.6));
}

// Generate pick headline
function generateHeadline(
  prospect: DraftProspect,
  pickNumber: number,
  valueScore: number,
  needsFilled: boolean
): string {
  const { isReach, reachDistance } = checkReach(prospect, pickNumber);
  const { isFalling, fallDistance } = checkProspectFalling(prospect, pickNumber);

  if (isReach && reachDistance >= 20) {
    return `Major reach: ${prospect.name} taken ${reachDistance} picks early`;
  }
  if (isReach) {
    return `${prospect.name} goes off the board earlier than expected`;
  }
  if (isFalling && fallDistance >= 15) {
    return `STEAL ALERT: ${prospect.name} falls to ${pickNumber}!`;
  }
  if (isFalling) {
    return `Value pick: ${prospect.name} slides to ${pickNumber}`;
  }
  if (valueScore >= 85 && needsFilled) {
    return `Perfect fit: ${prospect.name} fills key need with value`;
  }
  if (needsFilled) {
    return `${prospect.name} addresses a team need at ${prospect.position}`;
  }
  return `${prospect.name} goes at pick ${pickNumber} as expected`;
}

// Generate detailed analysis
function generateAnalysis(
  prospect: DraftProspect,
  pickNumber: number,
  teamNeeds: string[],
  valueScore: number,
  needScore: number,
  talentScore: number
): { analysis: string; concerns: string[]; upside: string } {
  const round = Math.ceil(pickNumber / 32);
  const concerns: string[] = [];
  let upside = "";

  let analysis = `${prospect.name} (${prospect.position}, ${prospect.college}) `;

  // Value assessment
  if (valueScore >= 90) {
    analysis += "represents outstanding value at this pick. ";
    upside = "Could outperform draft position significantly";
  } else if (valueScore >= 75) {
    analysis += "comes at a fair price point. ";
    upside = "Solid pick with room to grow";
  } else if (valueScore >= 60) {
    analysis += "is a slight reach based on consensus rankings. ";
    concerns.push("Taken earlier than most boards");
  } else {
    analysis += "is a significant reach that needs to be justified. ";
    concerns.push("Major reach compared to draft boards");
    concerns.push("Could have addressed this position later");
  }

  // Need assessment
  const needIndex = teamNeeds.indexOf(prospect.position);
  if (needIndex === 0) {
    analysis += "This pick directly addresses the team's most pressing need. ";
  } else if (needIndex >= 0 && needIndex <= 2) {
    analysis += "This fills a notable roster hole. ";
  } else if (needIndex === -1) {
    analysis += "This is more of a best-player-available selection. ";
    if (round <= 2) {
      concerns.push("Didn't address immediate needs");
    }
  }

  // Talent assessment
  if (talentScore >= 85) {
    analysis += "Elite talent that could make an immediate impact.";
    upside = upside || "Pro Bowl potential if developed properly";
  } else if (talentScore >= 70) {
    analysis += "Solid prospect with starting potential.";
    upside = upside || "Could develop into quality starter";
  } else {
    analysis += "A developmental prospect who needs time.";
    concerns.push("May need significant development time");
  }

  // Add prospect-specific concerns from flags
  if (prospect.flags) {
    if (prospect.flags.includes("injury_history")) {
      concerns.push("Has injury concerns to monitor");
    }
    if (prospect.flags.includes("character_concerns")) {
      concerns.push("Some character red flags in background");
    }
    if (prospect.flags.includes("limited_experience")) {
      concerns.push("Limited college production/experience");
    }
  }

  return { analysis, concerns, upside };
}

// Generate comparisons
function generateComparisons(prospect: DraftProspect): string[] {
  // In a real implementation, this would use actual player comparison data
  // For now, generate position-appropriate template comparisons
  const comparisons: Record<string, string[]> = {
    QB: ["Patrick Mahomes (ceiling)", "Derek Carr (floor)", "Josh Allen (style)"],
    RB: ["Nick Chubb (style)", "Dalvin Cook (athleticism)", "David Montgomery (floor)"],
    WR: ["Ja'Marr Chase (ceiling)", "Tyler Lockett (role)", "Chris Godwin (comparison)"],
    TE: ["George Kittle (upside)", "Dallas Goedert (realistic)", "Kyle Pitts (ceiling)"],
    OT: ["Trent Williams (ceiling)", "Jawaan Taylor (floor)", "Penei Sewell (comp)"],
    OG: ["Quenton Nelson (ceiling)", "Joel Bitonio (realistic)", "Kevin Zeitler (floor)"],
    C: ["Jason Kelce (ceiling)", "Corey Linsley (style)", "Ryan Kelly (comp)"],
    DE: ["Myles Garrett (ceiling)", "Montez Sweat (style)", "Carl Lawson (floor)"],
    DT: ["Aaron Donald (impossible ceiling)", "Chris Jones (realistic)", "Javon Hargrave (floor)"],
    LB: ["Micah Parsons (ceiling)", "Roquan Smith (style)", "Tremaine Edmunds (comp)"],
    CB: ["Jalen Ramsey (ceiling)", "Darius Slay (realistic)", "L'Jarius Sneed (floor)"],
    S: ["Derwin James (ceiling)", "Jessie Bates (style)", "Marcus Williams (comp)"],
  };

  return comparisons[prospect.position] || ["TBD"];
}

/**
 * Generate a grade for a single pick
 */
export function generatePickGrade(
  pick: DraftPick,
  prospect: DraftProspect,
  teamName: string,
  teamNeeds: string[]
): PickGrade {
  const valueScore = calculateValueScore(pick.pickNumber, prospect.consensusRank);
  const needScore = calculateNeedScore(prospect.position, teamNeeds, pick.pickNumber);
  const talentScore = calculateTalentScore(prospect, pick.pickNumber);

  // Weighted overall score
  const overallScore = Math.round(
    (valueScore * 0.35) + (needScore * 0.30) + (talentScore * 0.35)
  );

  const pickDiff = prospect.consensusRank - pick.pickNumber;
  const { isReach } = checkReach(prospect, pick.pickNumber);
  const { isFalling } = checkProspectFalling(prospect, pick.pickNumber);

  const headline = generateHeadline(
    prospect,
    pick.pickNumber,
    valueScore,
    teamNeeds.includes(prospect.position)
  );

  const { analysis, concerns, upside } = generateAnalysis(
    prospect,
    pick.pickNumber,
    teamNeeds,
    valueScore,
    needScore,
    talentScore
  );

  const comparisons = generateComparisons(prospect);

  return {
    pickNumber: pick.pickNumber,
    round: Math.ceil(pick.pickNumber / 32),
    teamId: pick.currentTeamId,
    teamName,
    prospectId: prospect.id,
    prospectName: prospect.name,
    position: prospect.position,

    overallGrade: scoreToGrade(overallScore),
    valueGrade: scoreToGrade(valueScore),
    needGrade: scoreToGrade(needScore),
    talentGrade: scoreToGrade(talentScore),

    overallScore,
    valueScore,
    needScore,
    talentScore,

    headline,
    analysis,
    comparisons,
    concerns: concerns.length > 0 ? concerns : undefined,
    upside,

    consensusRank: prospect.consensusRank,
    pickDiff,
    isReach,
    isSteal: isFalling,
    timestamp: new Date(),
  };
}

/**
 * Generate team draft grade from all their picks
 */
export function generateTeamDraftGrade(
  teamId: string,
  teamName: string,
  pickGrades: PickGrade[]
): TeamDraftGrade {
  if (pickGrades.length === 0) {
    return {
      teamId,
      teamName,
      overallGrade: "N/A",
      overallScore: 0,
      valueGrade: "N/A",
      needGrade: "N/A",
      talentGrade: "N/A",
      picks: [],
      totalPicks: 0,
      summary: "No picks to evaluate",
      strengths: [],
      weaknesses: [],
    };
  }

  // Calculate averages
  const avgOverall = pickGrades.reduce((sum, p) => sum + p.overallScore, 0) / pickGrades.length;
  const avgValue = pickGrades.reduce((sum, p) => sum + p.valueScore, 0) / pickGrades.length;
  const avgNeed = pickGrades.reduce((sum, p) => sum + p.needScore, 0) / pickGrades.length;
  const avgTalent = pickGrades.reduce((sum, p) => sum + p.talentScore, 0) / pickGrades.length;

  // Find best and worst picks
  const sortedByScore = [...pickGrades].sort((a, b) => b.overallScore - a.overallScore);
  const bestPick = sortedByScore[0];
  const worstPick = sortedByScore[sortedByScore.length - 1];

  // Generate summary
  let summary = `The ${teamName} had `;
  if (avgOverall >= 80) {
    summary += "an excellent draft, ";
  } else if (avgOverall >= 70) {
    summary += "a solid draft, ";
  } else if (avgOverall >= 60) {
    summary += "an average draft, ";
  } else {
    summary += "a questionable draft, ";
  }

  const positions = pickGrades.map(p => p.position);
  const uniquePositions = [...new Set(positions)];
  summary += `selecting ${pickGrades.length} players across ${uniquePositions.length} positions. `;

  if (bestPick) {
    summary += `${bestPick.prospectName} stands out as their best value pick.`;
  }

  // Identify strengths and weaknesses
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (avgValue >= 75) strengths.push("Excellent value throughout");
  if (avgNeed >= 75) strengths.push("Addressed key needs effectively");
  if (avgTalent >= 75) strengths.push("High-ceiling talent acquired");
  if (pickGrades.filter(p => p.isSteal).length >= 2) strengths.push("Found multiple steals");

  if (avgValue < 60) weaknesses.push("Reached on several picks");
  if (avgNeed < 60) weaknesses.push("Didn't address pressing needs");
  if (avgTalent < 60) weaknesses.push("Limited upside in selections");
  if (pickGrades.filter(p => p.isReach).length >= 2) weaknesses.push("Multiple reaches hurt value");

  // MVP narrative
  let mvp: string | undefined;
  if (bestPick && bestPick.overallScore >= 80) {
    mvp = `${bestPick.prospectName} at pick ${bestPick.pickNumber} was the crown jewel of this class`;
  }

  return {
    teamId,
    teamName,
    overallGrade: scoreToGrade(avgOverall),
    overallScore: Math.round(avgOverall),
    valueGrade: scoreToGrade(avgValue),
    needGrade: scoreToGrade(avgNeed),
    talentGrade: scoreToGrade(avgTalent),
    picks: pickGrades,
    totalPicks: pickGrades.length,
    bestPick,
    worstPick,
    summary,
    strengths,
    weaknesses,
    mvp,
  };
}

/**
 * Generate full draft class analysis
 */
export function generateDraftClassGrade(
  draftYear: number,
  teamGrades: TeamDraftGrade[],
  allPickGrades: PickGrade[]
): DraftClassGrade {
  // Sort teams by grade
  const sortedTeams = [...teamGrades].sort((a, b) => b.overallScore - a.overallScore);

  // Find superlatives
  const bestDraft = sortedTeams[0];
  const worstDraft = sortedTeams[sortedTeams.length - 1];

  const sortedPicks = [...allPickGrades].sort((a, b) => b.overallScore - a.overallScore);
  const bestPick = sortedPicks[0];

  const reaches = allPickGrades.filter(p => p.isReach).sort((a, b) => a.pickDiff - b.pickDiff);
  const biggestReach = reaches[0] || sortedPicks[sortedPicks.length - 1];

  const steals = allPickGrades.filter(p => p.isSteal).sort((a, b) => b.pickDiff - a.pickDiff);
  const biggestSteal = steals[0] || sortedPicks[0];

  // Position breakdown
  const positionBreakdown: Record<string, { count: number; avgPick: number }> = {};
  allPickGrades.forEach(pick => {
    if (!positionBreakdown[pick.position]) {
      positionBreakdown[pick.position] = { count: 0, avgPick: 0 };
    }
    positionBreakdown[pick.position].count++;
    positionBreakdown[pick.position].avgPick += pick.pickNumber;
  });

  Object.keys(positionBreakdown).forEach(pos => {
    positionBreakdown[pos].avgPick = Math.round(
      positionBreakdown[pos].avgPick / positionBreakdown[pos].count
    );
  });

  // Round-by-round analysis
  const roundAnalysis: { round: number; avgScore: number; topPick: PickGrade }[] = [];
  for (let round = 1; round <= 7; round++) {
    const roundPicks = allPickGrades.filter(p => p.round === round);
    if (roundPicks.length > 0) {
      const avgScore = roundPicks.reduce((sum, p) => sum + p.overallScore, 0) / roundPicks.length;
      const topPick = [...roundPicks].sort((a, b) => b.overallScore - a.overallScore)[0];
      roundAnalysis.push({ round, avgScore: Math.round(avgScore), topPick });
    }
  }

  return {
    draftYear,
    totalPicks: allPickGrades.length,
    teamGrades,
    bestDraft: {
      teamId: bestDraft.teamId,
      teamName: bestDraft.teamName,
      grade: bestDraft.overallGrade,
    },
    worstDraft: {
      teamId: worstDraft.teamId,
      teamName: worstDraft.teamName,
      grade: worstDraft.overallGrade,
    },
    bestPick,
    biggestReach,
    biggestSteal,
    positionBreakdown,
    roundAnalysis,
  };
}

/**
 * Generate "media" style reaction (immediate hot take)
 */
export function generateMediaReaction(pickGrade: PickGrade): {
  source: string;
  reaction: string;
  sentiment: "positive" | "negative" | "neutral";
} {
  const sources = [
    "Draft Analyst",
    "NFL Network",
    "ESPN Draft Expert",
    "The Athletic",
    "Pro Football Focus",
    "Draft Scout Weekly",
  ];

  const source = sources[Math.floor(Math.random() * sources.length)];
  let reaction: string;
  let sentiment: "positive" | "negative" | "neutral";

  if (pickGrade.overallScore >= 85) {
    reaction = [
      `Love this pick. ${pickGrade.prospectName} was the best player available.`,
      `A+ selection here. Perfect fit and great value.`,
      `This is how you build a championship team. Outstanding pick.`,
      `Steal of the draft so far. Can't believe ${pickGrade.prospectName} was available.`,
    ][Math.floor(Math.random() * 4)];
    sentiment = "positive";
  } else if (pickGrade.overallScore >= 70) {
    reaction = [
      `Solid pick. ${pickGrade.prospectName} should contribute early.`,
      `Can't argue with this selection. Makes sense for the team.`,
      `Good value here. ${pickGrade.prospectName} fills a need.`,
      `Like this pick. Safe floor with upside.`,
    ][Math.floor(Math.random() * 4)];
    sentiment = "positive";
  } else if (pickGrade.overallScore >= 55) {
    reaction = [
      `Interesting choice. ${pickGrade.prospectName} wasn't on many boards this high.`,
      `A bit early for ${pickGrade.prospectName}, but I understand the fit.`,
      `Not sure about the value here, but maybe they know something we don't.`,
      `Reaching a bit, but ${pickGrade.position} was a need.`,
    ][Math.floor(Math.random() * 4)];
    sentiment = "neutral";
  } else {
    reaction = [
      `I don't get this pick. ${pickGrade.prospectName} could have been there later.`,
      `Major reach. ${pickGrade.prospectName} is a Day 3 talent at best.`,
      `Yikes. This will be mocked for years if it doesn't work out.`,
      `Confused by this selection. Several better options were available.`,
    ][Math.floor(Math.random() * 4)];
    sentiment = "negative";
  }

  return { source, reaction, sentiment };
}

export type { PickGrade, TeamDraftGrade, DraftClassGrade };
