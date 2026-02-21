import { supabase } from "@/lib/supabase-client";

/**
 * Validate that scouting requirements are met before draft can proceed
 * Shared function that can be called from other modules
 */
export async function validateScoutingComplete(
  teamId: string,
  season?: number,
  saveGameId?: string
): Promise<{
  isValid: boolean;
  requirements: {
    minimumScouted: number;
    scoutedInRange: number;
    totalInRange: number;
    percentageScouted: number;
    top50Scouted: boolean;
    draftRangeScouted: boolean;
  };
  recommendations: string[];
  unscoutedCritical: string[];
}> {
  // Use provided season or get current season (current season's draft)
  let draftSeason: number;
  if (season) {
    draftSeason = season;
  } else {
    const { data: activeSeason } = await supabase
      .from("seasons")
      .select("year")
      .eq("is_active", true)
      .single();
    draftSeason = activeSeason?.year || 2025;
  }

  // Get team's draft picks to determine draft range
  let draftPicksQuery = supabase
    .from("draft_picks")
    .select("pick_overall, round")
    .eq("owning_team_id", teamId)
    .eq("season", draftSeason);
  
  if (saveGameId) {
    draftPicksQuery = draftPicksQuery.eq("save_game_id", saveGameId);
  } else {
    draftPicksQuery = draftPicksQuery.is("save_game_id", null);
  }
  
  const { data: draftPicks } = await draftPicksQuery.order("pick_overall", { ascending: true });

  // Determine draft range (first 3 rounds or top 100, whichever is larger)
  const firstRoundPicks = draftPicks?.filter((p) => p.round === 1) || [];
  const maxPickNumber = Math.max(
    ...(firstRoundPicks.map((p) => p.pick_overall) || [100]),
    100
  );

  // Get top prospects in draft range
  let prospectsQuery = supabase
    .from("draft_prospects")
    .select("id, overall")
    .eq("season", draftSeason);
  
  if (saveGameId) {
    prospectsQuery = prospectsQuery.eq("save_game_id", saveGameId);
  } else {
    prospectsQuery = prospectsQuery.is("save_game_id", null);
  }
  
  const { data: topProspects } = await prospectsQuery
    .order("overall", { ascending: false })
    .limit(Math.max(maxPickNumber, 50));

  const topProspectIdList = topProspects?.map((p) => p.id) || [];
  const topProspectIds = new Set(topProspectIdList);

  // Get scouted prospects for this team in the current draft pool
  let scoutedQuery = supabase
    .from("scouted_prospects")
    .select("prospect_id")
    .eq("team_id", teamId);

  if (saveGameId) {
    scoutedQuery = scoutedQuery.eq("save_game_id", saveGameId);
  } else {
    scoutedQuery = scoutedQuery.is("save_game_id", null);
  }

  if (topProspectIdList.length > 0) {
    scoutedQuery = scoutedQuery.in("prospect_id", topProspectIdList);
  }

  const { data: scoutedProspects } = await scoutedQuery;
  const scoutedProspectIds = new Set(
    scoutedProspects?.map((r) => r.prospect_id) || []
  );

  // Check requirements
  const totalProspects = topProspects?.length || 0;
  
  // If there are no prospects, scouting cannot be complete
  if (totalProspects === 0) {
    return {
      isValid: false,
      requirements: {
        minimumScouted: 0,
        scoutedInRange: 0,
        totalInRange: 0,
        percentageScouted: 0,
        top50Scouted: false,
        draftRangeScouted: false,
      },
      recommendations: ["No draft prospects found. Generate a draft class first."],
      unscoutedCritical: [],
    };
  }
  
  const scoutedInRange = Array.from(topProspectIds).filter((id) =>
    scoutedProspectIds.has(id)
  ).length;

  const percentageScouted = totalProspects > 0 ? (scoutedInRange / totalProspects) * 100 : 0;

  // Minimum requirements - need at least 30% or 50 prospects, whichever is smaller
  const minScouted = Math.min(50, Math.ceil(totalProspects * 0.3));
  const meetsMinimum = scoutedInRange >= minScouted;

  // Check if all top prospects are scouted (only if we have at least 50 prospects)
  const top50Scouted = totalProspects >= 50 && Array.from(topProspectIds)
    .slice(0, 50)
    .every((id) => scoutedProspectIds.has(id));

  // Check if all draft range prospects are scouted
  const draftRangeScouted = Array.from(topProspectIds)
    .slice(0, Math.min(maxPickNumber, totalProspects))
    .every((id) => scoutedProspectIds.has(id));

  // Only valid if we meet minimum AND have scouted some prospects
  const isValid = (meetsMinimum || top50Scouted || draftRangeScouted) && scoutedInRange > 0;

  // Get unscouted critical prospects
  const unscoutedCritical = Array.from(topProspectIds)
    .slice(0, Math.max(50, maxPickNumber))
    .filter((id) => !scoutedProspectIds.has(id))
    .slice(0, 10); // Top 10 unscouted

  return {
    isValid,
    requirements: {
      minimumScouted: minScouted,
      scoutedInRange,
      totalInRange: totalProspects,
      percentageScouted: Math.round(percentageScouted * 100) / 100,
      top50Scouted,
      draftRangeScouted,
    },
    recommendations: isValid
      ? []
      : [
          `Scout at least ${minScouted - scoutedInRange} more prospects in your draft range`,
          "Focus on top 50 prospects if available",
          "Ensure all prospects in your first 3 rounds are scouted",
        ],
    unscoutedCritical: unscoutedCritical,
  };
}
