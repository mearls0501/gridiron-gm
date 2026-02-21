"use client";

import { useState } from "react";

export default function AddProspectTransactionsPage() {
  const [copied, setCopied] = useState(false);

  const migrationSQL = `-- Add prospect_id to transactions table
-- This allows tracking transactions for draft prospects (rookies) in addition to established players

ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES public.draft_prospects(id) ON DELETE SET NULL;

-- Add index for prospect transactions
CREATE INDEX IF NOT EXISTS idx_transactions_prospect ON public.transactions(prospect_id);

-- Add comment
COMMENT ON COLUMN public.transactions.prospect_id IS 'Reference to draft prospect if transaction involves a rookie not yet in players table';`;

  const handleCopy = () => {
    navigator.clipboard.writeText(migrationSQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Add Prospect Support to Transactions
          </h1>
          
          <div className="mb-6">
            <p className="text-gray-700 mb-4">
              This migration adds support for tracking draft prospects in the transactions table.
              This is needed to display salary cap cuts of rookies in the transactions page.
            </p>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <h2 className="font-bold text-blue-900 mb-2">Instructions:</h2>
              <ol className="list-decimal list-inside text-blue-800 space-y-1">
                <li>Copy the SQL below</li>
                <li>Go to your Supabase dashboard</li>
                <li>Navigate to SQL Editor</li>
                <li>Paste and run the SQL</li>
              </ol>
            </div>
          </div>

          <div className="relative">
            <pre className="bg-gray-900 text-green-400 p-6 rounded-lg overflow-x-auto text-sm font-mono">
              {migrationSQL}
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-4 right-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              {copied ? "Copied!" : "Copy SQL"}
            </button>
          </div>

          <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 font-medium">
              ✅ After running this migration, the /league/transactions page will display all player cuts,
              including salary cap cuts made by the auto-fix feature.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}



