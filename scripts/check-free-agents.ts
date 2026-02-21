import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkFreeAgents() {
  console.log('🔍 Checking free agent data...\n');
  
  // Get the most recent save game
  const { data: saveGames } = await supabase
    .from('save_games')
    .select('id, save_name')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!saveGames || saveGames.length === 0) {
    console.log('❌ No save games found!');
    return;
  }

  const saveGameId = saveGames[0].id;
  console.log(`📋 Save Game: "${saveGames[0].save_name}" (${saveGameId})\n`);

  // Check free agents in players table
  const { count: playersCount } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('is_free_agent', true);

  console.log(`✅ Free agents in players table: ${playersCount || 0}\n`);

  // Check availability records
  const { data: availability, count: availCount } = await supabase
    .from('free_agent_availability')
    .select('*', { count: 'exact' })
    .eq('save_game_id', saveGameId)
    .eq('archived', false);

  console.log(`✅ Availability records for this save: ${availCount || 0}\n`);

  if (availability && availability.length > 0) {
    console.log('📊 Sample availability records:');
    availability.slice(0, 3).forEach((rec: any) => {
      console.log(`  - Player ID: ${rec.player_id}, Reason: ${rec.reason}, Season: ${rec.entered_free_agency_season}`);
    });
    console.log('');
  }

  // Test the actual query the free agents page uses
  console.log('🔍 Testing free agents page query...\n');
  
  const { data: testQuery, error: testError } = await supabase
    .from('free_agent_availability')
    .select(`
      player_id,
      prospect_id,
      save_game_id,
      archived,
      entered_free_agency_season,
      players (
        id,
        full_name,
        position,
        overall,
        potential,
        age,
        college
      )
    `)
    .eq('save_game_id', saveGameId)
    .eq('archived', false)
    .not('player_id', 'is', null);

  if (testError) {
    console.log('❌ Query error:', testError.message);
  } else {
    console.log(`✅ Query successful: ${testQuery?.length || 0} records returned`);
    
    if (testQuery && testQuery.length > 0) {
      console.log('\n📊 Sample players:');
      testQuery.slice(0, 3).forEach((rec: any) => {
        if (rec.players) {
          console.log(`  - ${rec.players.full_name} (${rec.players.position}) OVR: ${rec.players.overall}`);
        } else {
          console.log(`  - Player ID ${rec.player_id} (no player data joined)`);
        }
      });
    } else {
      console.log('\n⚠️  Query returned 0 results!');
      
      // Fallback query
      console.log('\n🔍 Testing fallback query...');
      const { data: fallback, error: fallbackError } = await supabase
        .from('players')
        .select('id, full_name, position, overall, potential, age, college')
        .eq('is_free_agent', true)
        .limit(5);
        
      if (fallbackError) {
        console.log('❌ Fallback query error:', fallbackError.message);
      } else {
        console.log(`✅ Fallback query: ${fallback?.length || 0} players`);
        if (fallback && fallback.length > 0) {
          fallback.forEach((p: any) => {
            console.log(`  - ${p.full_name} (${p.position}) OVR: ${p.overall}`);
          });
        }
      }
    }
  }
}

checkFreeAgents()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });

