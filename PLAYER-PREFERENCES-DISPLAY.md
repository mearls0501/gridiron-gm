# Player Contract Preferences Display

## What You Should See

When you visit the Free Agents page, each player card should now display:

### Player Asking Price Box (Blue Box)
```
💵 Player Asking Price
Salary: $15M/yr | Length: 3 years | Total Value: $47.25M
```

This appears **above** the bidding information and shows:
- **Preferred Annual Salary** - What the player wants per year
- **Preferred Contract Length** - How many years they want
- **Total Contract Value** - Complete package (salary × years + bonus)

### How It Works

1. **Automatic Generation**: Preferences are generated automatically when:
   - You first visit the Free Agents page
   - Free agency bidding is started
   - Based on player's overall rating, age, and position

2. **When Placing a Bid**: Click "Place Bid" and the form will:
   - Auto-fill with the player's preferred salary
   - Auto-fill with the player's preferred contract length
   - Show hints like "Player wants: $15M"

3. **Your Bidding Options**:
   - **Bid Under**: Risk losing player but save cap space
   - **Meet Asking Price**: Competitive, fair offer
   - **Bid Over**: Increase chances of winning

## Example Player Cards

### Elite QB (95 OVR, Age 28)
```
Patrick Mahomes - QB
OVR: 95 | POT: 95 | Age: 28 | Texas Tech

💵 Player Asking Price
Salary: $28,000,000/yr | Length: 4 years | Total Value: $112,000,000

[Place Bid Button]
```

### Veteran DE (82 OVR, Age 32)
```
Joey Bosa - DE
OVR: 82 | POT: 80 | Age: 32 | Ohio State

💵 Player Asking Price
Salary: $11,500,000/yr | Length: 2 years | Total Value: $23,000,000

[Place Bid Button]
```

### Young WR (72 OVR, Age 24)
```
John Smith - WR
OVR: 72 | POT: 85 | Age: 24 | Alabama

💵 Player Asking Price
Salary: $3,500,000/yr | Length: 3 years | Total Value: $10,500,000

[Place Bid Button]
```

## Troubleshooting

### If you don't see the blue asking price box:

1. **Refresh the page** - Preferences generate on load
2. **Check browser console** - Look for "No preferences found, generating..."
3. **Run migration** - Make sure the database table exists:
   ```bash
   # The migration should create the free_agency_player_preferences table
   ```

### If preferences aren't generating:

1. Make sure you have free agents in the system
2. Check that you have a valid `saveGameId` and `currentSeason`
3. Look in the Network tab for API calls to `/api/free-agency/generate-preferences`

## Files Modified

- `app/free-agents/page.tsx` - Added preference display and auto-generation
- `app/api/free-agency/generate-preferences/route.ts` - New API endpoint
- `lib/free-agency/player-preferences.ts` - Preference generation logic
- `supabase/migrations/create_free_agency_bidding_system.sql` - Database table

## Technical Details

### Preference Calculation

**Salary by Overall:**
- 95+ OVR: $30M
- 90-94 OVR: $22M  
- 85-89 OVR: $16M
- 80-84 OVR: $11M
- 75-79 OVR: $7M
- 70-74 OVR: $4M
- 65-69 OVR: $2M
- 60-64 OVR: $1.2M
- <60 OVR: $900k

**Position Multipliers:**
- QB: 1.3x
- DE: 1.15x
- DT, OT, CB: 1.1x
- WR, LB: 1.05x

**Contract Length by Age:**
- ≤26 years: 1-4 years (young, want security)
- 27-29 years: 2-4 years (prime)
- 30-32 years: 1-3 years (later prime)
- 33+ years: 1-2 years (veteran)

**Signing Bonus:**
- 85+ OVR: 20% of Year 1
- 75-84 OVR: 15% of Year 1
- 70-74 OVR: 10% of Year 1
- <70 OVR: None

### Database Schema

```sql
CREATE TABLE free_agency_player_preferences (
  id UUID PRIMARY KEY,
  save_game_id UUID NOT NULL,
  season INTEGER NOT NULL,
  player_id UUID,
  prospect_id UUID,
  preferred_annual_salary INTEGER NOT NULL,
  preferred_contract_years INTEGER NOT NULL,
  preferred_signing_bonus INTEGER DEFAULT 0,
  min_acceptable_salary INTEGER NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW()
);
```



