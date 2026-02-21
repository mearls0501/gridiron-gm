'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useGameStore } from '@/lib/store/game-store';

interface PlayerContract {
  player_id: string | null;
  prospect_id: string | null;
  contract_year_1: number;
  contract_year_2: number | null;
  contract_year_3: number | null;
  contract_year_4: number | null;
  signing_bonus: number;
}

export function ContractDisplay({ playerId }: { playerId: string }) {
  const { saveGameId } = useGameStore();
  const [contract, setContract] = useState<PlayerContract | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadContract() {
      if (!saveGameId) {
        setLoading(false);
        return;
      }

      // Try player_id first
      const { data: playerContract } = await supabase
        .from('player_contracts_per_save_game')
        .select('*')
        .eq('player_id', playerId)
        .eq('save_game_id', saveGameId)
        .maybeSingle();

      if (playerContract) {
        setContract(playerContract);
        setLoading(false);
        return;
      }

      // Try prospect_id
      const { data: prospectContract } = await supabase
        .from('player_contracts_per_save_game')
        .select('*')
        .eq('prospect_id', playerId)
        .eq('save_game_id', saveGameId)
        .maybeSingle();

      if (prospectContract) {
        setContract(prospectContract);
      }

      setLoading(false);
    }

    loadContract();
  }, [playerId, saveGameId]);

  if (loading) {
    return null;
  }

  if (!contract || !contract.contract_year_1) {
    return null;
  }

  return (
    <div className="mt-8 bg-gray-50 rounded-lg p-6 border border-gray-200">
      <h2 className="text-2xl font-bold mb-4 text-gray-900">
        Contract
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-sm text-gray-600 mb-1">Year 1</p>
          <p className="text-lg font-semibold text-gray-900">
            ${(contract.contract_year_1 || 0).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600 mb-1">Year 2</p>
          <p className="text-lg font-semibold text-gray-900">
            {contract.contract_year_2 === null
              ? "N/A"
              : `$${(contract.contract_year_2 || 0).toLocaleString()}`}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600 mb-1">Year 3</p>
          <p className="text-lg font-semibold text-gray-900">
            {contract.contract_year_3 === null
              ? "N/A"
              : `$${(contract.contract_year_3 || 0).toLocaleString()}`}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600 mb-1">Year 4</p>
          <p className="text-lg font-semibold text-gray-900">
            {contract.contract_year_4 === null
              ? "N/A"
              : `$${(contract.contract_year_4 || 0).toLocaleString()}`}
          </p>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-600 mb-1">Signing Bonus</p>
        <p className="text-2xl font-bold text-blue-600">
          ${(contract.signing_bonus || 0).toLocaleString()}
        </p>
      </div>
    </div>
  );
}



