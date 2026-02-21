import { createClient } from '@supabase/supabase-js';

// Environment variables will be passed via command line
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables!');
  console.error('Make sure .env.local has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixFreeAgentAvailability() {
  console.log('🔍 Finding your most recent save game...\n');
  
  // Get the most recent save game
  const { data: saveGames, error: saveError } = await supabase
    .from('save_games')
    .select('id, save_name, current_season, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  if (saveError) {
    console.error('❌ Error fetching save games:', saveError.message);
    process.exit(1);
  }

  if (!saveGames || saveGames.length === 0) {
    console.error('❌ No save games found!');
    process.exit(1);
  }

  console.log('📋 Found save games:');
  saveGames.forEach((sg, i) => {
    console.log(`  ${i + 1}. ${sg.save_name} (Season ${sg.current_season}) - ${new Date(sg.created_at).toLocaleString()}`);
  });

  const saveGame = saveGames[0];
  console.log(`\n✅ Using most recent: "${saveGame.save_name}" (ID: ${saveGame.id})\n`);

  // Check how many free agents exist
  const { count: freeAgentCount } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('is_free_agent', true);

  console.log(`📊 Found ${freeAgentCount || 0} free agents in players table\n`);

  if (!freeAgentCount || freeAgentCount === 0) {
    console.log('⚠️  No free agents found! Run the seed-free-agents admin page first.');
    process.exit(0);
  }

  // Check existing availability records
  const { count: existingCount } = await supabase
    .from('free_agent_availability')
    .select('*', { count: 'exact', head: true })
    .eq('save_game_id', saveGame.id)
    .eq('archived', false);

  console.log(`📋 Existing availability records for this save: ${existingCount || 0}\n`);

  // Get all free agents
  const { data: freeAgents, error: freeAgentsError } = await supabase
    .from('players')
    .select('id')
    .eq('is_free_agent', true);

  if (freeAgentsError) {
    console.error('❌ Error fetching free agents:', freeAgentsError.message);
    process.exit(1);
  }

  if (!freeAgents || freeAgents.length === 0) {
    console.log('⚠️  No free agents to process!');
    process.exit(0);
  }

  console.log(`🔄 Creating availability records for ${freeAgents.length} free agents...\n`);

  // Create availability records
  const availabilityRecords = freeAgents.map(fa => ({
    player_id: fa.id,
    save_game_id: saveGame.id,
    entered_free_agency_season: saveGame.current_season,
    reason: 'initial',
    archived: false,
  }));

  const { data, error } = await supabase
    .from('free_agent_availability')
    .upsert(availabilityRecords, {
      onConflict: 'player_id,save_game_id',
    });

  if (error) {
    console.error('❌ Error creating availability records:', error.message);
    process.exit(1);
  }

  // Verify the records were created
  const { count: newCount } = await supabase
    .from('free_agent_availability')
    .select('*', { count: 'exact', head: true })
    .eq('save_game_id', saveGame.id)
    .eq('archived', false);

  console.log(`✅ Success! ${newCount || 0} free agents are now available in your save game!\n`);
  console.log('🎮 Visit the Free Agents page to see them: http://localhost:3005/free-agents\n');
}

fixFreeAgentAvailability()
  .then(() => {
    console.log('✨ Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  });

