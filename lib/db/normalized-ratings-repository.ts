import { supabase } from '../supabase-client';
import {
  PlayerDevelopment,
  PlayerTrueRatings,
  Relationship,
  RelationshipEvent,
  SchemeFitProfile,
  TeamStrengthSnapshot,
} from '../ratings/normalized-schema-types';

type DbError = { message?: string } | null;

function assertNoError(error: DbError, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message ?? 'unknown database error'}`);
  }
}

export async function upsertPlayerTrueProfile(params: {
  saveGameId: string;
  playerId: string;
  ratings: Pick<
    PlayerTrueRatings,
    | 'potential'
    | 'injuryProneness'
    | 'durability'
    | 'footballIQ'
    | 'character'
    | 'leadership'
    | 'workEthic'
    | 'clutch'
    | 'spd'
    | 'str'
    | 'agi'
    | 'acc'
  >;
}): Promise<void> {
  const payload = {
    save_game_id: params.saveGameId,
    player_id: params.playerId,
    potential: params.ratings.potential,
    injury_proneness: params.ratings.injuryProneness,
    durability: params.ratings.durability,
    football_iq: params.ratings.footballIQ,
    character: params.ratings.character,
    leadership: params.ratings.leadership,
    work_ethic: params.ratings.workEthic,
    clutch: params.ratings.clutch,
    spd: params.ratings.spd,
    str: params.ratings.str,
    agi: params.ratings.agi,
    acc: params.ratings.acc,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('player_true_profiles')
    .upsert(payload, { onConflict: 'player_id,save_game_id' });

  assertNoError(error, 'Failed to upsert player true profile');
}

export async function replacePlayerTrueAttributes(params: {
  saveGameId: string;
  playerId: string;
  attributes: Record<string, number>;
}): Promise<void> {
  const { error: deleteError } = await supabase
    .from('player_true_rating_attributes')
    .delete()
    .eq('save_game_id', params.saveGameId)
    .eq('player_id', params.playerId);

  assertNoError(deleteError, 'Failed to clear player true attributes');

  const rows = Object.entries(params.attributes).map(([attributeKey, attributeValue]) => ({
    save_game_id: params.saveGameId,
    player_id: params.playerId,
    attribute_key: attributeKey,
    attribute_value: attributeValue,
  }));

  if (rows.length === 0) return;

  const { error: insertError } = await supabase.from('player_true_rating_attributes').insert(rows);
  assertNoError(insertError, 'Failed to insert player true attributes');
}

export async function upsertSchemeFitProfile(params: {
  saveGameId: string;
  playerId: string;
  profile: SchemeFitProfile;
}): Promise<void> {
  const { error } = await supabase.from('player_scheme_fit_profiles').upsert(
    {
      save_game_id: params.saveGameId,
      player_id: params.playerId,
      offensive_scheme: params.profile.offensiveScheme ?? null,
      defensive_scheme: params.profile.defensiveScheme ?? null,
      fit_modifiers: params.profile.fitModifiers,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'player_id,save_game_id' },
  );

  assertNoError(error, 'Failed to upsert player scheme fit profile');
}

export async function upsertPlayerDevelopment(params: {
  saveGameId: string;
  playerId: string;
  development: PlayerDevelopment;
}): Promise<void> {
  const { error } = await supabase.from('player_development_profiles').upsert(
    {
      save_game_id: params.saveGameId,
      player_id: params.playerId,
      development_tier: params.development.developmentTier,
      peak_age: params.development.peakAge,
      current_arc: params.development.currentArc,
      decline_rate: params.development.declineRate,
      breakout_probability: params.development.breakoutProbability,
      bust_risk: params.development.bustRisk,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'player_id,save_game_id' },
  );

  assertNoError(error, 'Failed to upsert player development');
}

export async function getPlayerRatingBundle(params: {
  saveGameId: string;
  playerId: string;
}): Promise<{
  trueProfile: Record<string, unknown> | null;
  trueAttributes: Record<string, number>;
  schemeFit: Record<string, unknown> | null;
  development: Record<string, unknown> | null;
}> {
  const [profileResult, attrResult, schemeResult, devResult] = await Promise.all([
    supabase
      .from('player_true_profiles')
      .select('*')
      .eq('save_game_id', params.saveGameId)
      .eq('player_id', params.playerId)
      .maybeSingle(),
    supabase
      .from('player_true_rating_attributes')
      .select('attribute_key,attribute_value')
      .eq('save_game_id', params.saveGameId)
      .eq('player_id', params.playerId),
    supabase
      .from('player_scheme_fit_profiles')
      .select('*')
      .eq('save_game_id', params.saveGameId)
      .eq('player_id', params.playerId)
      .maybeSingle(),
    supabase
      .from('player_development_profiles')
      .select('*')
      .eq('save_game_id', params.saveGameId)
      .eq('player_id', params.playerId)
      .maybeSingle(),
  ]);

  assertNoError(profileResult.error, 'Failed to fetch player true profile');
  assertNoError(attrResult.error, 'Failed to fetch player true attributes');
  assertNoError(schemeResult.error, 'Failed to fetch player scheme fit profile');
  assertNoError(devResult.error, 'Failed to fetch player development profile');

  const trueAttributes = (attrResult.data ?? []).reduce<Record<string, number>>((acc, row: any) => {
    acc[row.attribute_key] = row.attribute_value;
    return acc;
  }, {});

  return {
    trueProfile: (profileResult.data as Record<string, unknown> | null) ?? null,
    trueAttributes,
    schemeFit: (schemeResult.data as Record<string, unknown> | null) ?? null,
    development: (devResult.data as Record<string, unknown> | null) ?? null,
  };
}

export async function upsertRelationship(params: {
  saveGameId: string;
  relationship: Omit<Relationship, 'history'>;
}): Promise<string> {
  const { data, error } = await supabase
    .from('relationships')
    .upsert(
      {
        id: params.relationship.id,
        save_game_id: params.saveGameId,
        entity_a_type: params.relationship.entityA.type,
        entity_a_id: params.relationship.entityA.id,
        entity_b_type: params.relationship.entityB.type,
        entity_b_id: params.relationship.entityB.id,
        score: params.relationship.score,
        trend: params.relationship.trend,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select('id')
    .single();

  assertNoError(error, 'Failed to upsert relationship');
  return data.id as string;
}

export async function appendRelationshipEvent(params: {
  saveGameId: string;
  relationshipId: string;
  event: RelationshipEvent;
}): Promise<void> {
  const { error } = await supabase.from('relationship_events').insert({
    save_game_id: params.saveGameId,
    relationship_id: params.relationshipId,
    week: params.event.week,
    season: params.event.season,
    event_type: params.event.eventType,
    delta_score: params.event.deltaScore,
    description: params.event.description,
  });

  assertNoError(error, 'Failed to append relationship event');
}

export async function listRelationshipsForEntity(params: {
  saveGameId: string;
  entityType: Relationship['entityA']['type'];
  entityId: string;
}): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from('relationships')
    .select('*')
    .eq('save_game_id', params.saveGameId)
    .or(
      `and(entity_a_type.eq.${params.entityType},entity_a_id.eq.${params.entityId}),and(entity_b_type.eq.${params.entityType},entity_b_id.eq.${params.entityId})`,
    );

  assertNoError(error, 'Failed to list relationships for entity');
  return (data as Array<Record<string, unknown>>) ?? [];
}

export async function insertTeamStrengthSnapshot(params: {
  saveGameId: string;
  teamId: string;
  season: number;
  week: number;
  snapshot: TeamStrengthSnapshot;
}): Promise<void> {
  const { error } = await supabase.from('team_strength_snapshots').upsert(
    {
      save_game_id: params.saveGameId,
      team_id: params.teamId,
      season: params.season,
      week: params.week,
      offensive_rating: params.snapshot.offensiveRating,
      defensive_rating: params.snapshot.defensiveRating,
      special_teams_rating: params.snapshot.specialTeamsRating,
      chemistry_modifier: params.snapshot.chemistryModifier,
      scheme_coherence_modifier: params.snapshot.schemeCoherenceModifier,
      depth_modifier: params.snapshot.depthModifier,
    },
    { onConflict: 'save_game_id,team_id,season,week' },
  );

  assertNoError(error, 'Failed to insert team strength snapshot');
}

export async function getLatestTeamStrengthSnapshot(params: {
  saveGameId: string;
  teamId: string;
}): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('team_strength_snapshots')
    .select('*')
    .eq('save_game_id', params.saveGameId)
    .eq('team_id', params.teamId)
    .order('season', { ascending: false })
    .order('week', { ascending: false })
    .limit(1)
    .maybeSingle();

  assertNoError(error, 'Failed to fetch latest team strength snapshot');
  return (data as Record<string, unknown> | null) ?? null;
}
