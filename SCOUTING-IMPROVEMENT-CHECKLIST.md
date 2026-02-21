# Gridiron GM: Scouting Engine Improvement Checklist

> The NFL Draft is appointment television. This checklist transforms our scouting system from a solid simulation into the definitive draft experience.

---

## Phase 1: Foundation & Quick Wins (1-2 Weeks) ✅ COMPLETE

### 1.1 Scout Personality System ✅
- [x] Add `personality_type` field to scouts table (e.g., "optimistic", "pessimistic", "cautious", "bold")
- [x] Create `scout-personality.ts` module with archetype-specific language templates
- [x] Generate unique scout notes based on personality + archetype combination
- [x] Add scout avatars (using avatar_seed for procedural generation)
- [x] Display scout name and personality alongside their reports

### 1.2 Scouting Report Cards ✅
- [x] Design visual report card component (`ScoutingReportCard.tsx`)
- [x] Show letter grades (A+ to F) for each revealed attribute category
- [x] Color-code grades (green = good, red = concerning)
- [x] Add "confidence meter" showing how reliable the grade is
- [x] Include scout attribution ("Evaluated by: Marcus Thompson, Tape Grinder")

### 1.3 Big Board Builder ✅
- [x] Create `BigBoard.tsx` component with ranking (arrow buttons)
- [x] Persist board to database (`team_big_boards` table)
- [x] Show scouted info inline (OVR range, key traits, flags)
- [x] Add tier separators (Tier 1: Elite, Tier 2: Day 1, etc.)
- [x] Enable filtering by position, search
- [x] API endpoint for big board CRUD (`/api/big-board`)

### 1.4 Scout Assignment UI ✅
- [x] Build dedicated scout management component (`ScoutManagement.tsx`)
- [x] Visual priority assignment interface
- [x] Show weekly point allocation per scout
- [x] Display current workload and available points
- [x] Budget tracking for scout hiring

### 1.5 Database Migrations ✅
- [x] Created `20250119_add_scout_personality_bigboard.sql` migration
- [x] Added personality fields to scouts table
- [x] Created team_big_boards table
- [x] Created big_board_entries table
- [x] Created scout_accuracy_history table
- [x] Created scouting_notes table
- [x] Created scout_disagreements table

---

## Phase 2: Engagement & Drama (2-3 Weeks) ✅ COMPLETE

### 2.1 Scout Disagreement System ✅
- [x] Add `getScoutOpinion()` function that varies by scout personality
- [x] Create "conflicting reports" when scouts disagree by >15 points
- [x] Build notification system for scout disagreements (`ScoutDisagreements.tsx`)
- [x] UI component showing side-by-side conflicting opinions
- [x] API endpoint for disagreements (`/api/scout-disagreements`)

### 2.2 Boom/Bust Visibility ✅ (Integrated into Report Cards)
- [x] Surface bust/breakout probability in scouting reports
- [x] Create "upside/risk" indicator in ScoutingReportCard
- [x] Only reveal after Interview action by Character Coach
- [x] Add "projection confidence" showing how reliable the assessment is

### 2.3 Scouting Calendar Integration ✅
- [x] Create `ScoutingCalendar.tsx` with season phase definitions
- [x] Define phases: Regular Season, Bowl Season, Senior Bowl, Combine, Pro Days, Pre-Draft, Draft
- [x] Lock actions by phase (combine only during Combine, interview during offseason, etc.)
- [x] Show calendar view of available scouting windows
- [x] Track available events and upcoming deadlines

### 2.4 Prospect Comparison Tool ✅
- [x] Build `ProspectComparison.tsx` side-by-side comparison view
- [x] Compare 2 prospects simultaneously
- [x] Highlight differences in scouted attributes
- [x] Show which data is scouted vs actual
- [x] Position-specific attribute comparisons
- [x] Search and filter for prospect selection

### 2.5 Regional Scout Bonuses ✅
- [x] Add `region` field to scouts table (SEC, Big Ten, Pac-12, ACC, etc.)
- [x] Add `college_conference` to prospects
- [x] Apply 15% accuracy bonus when scout region matches prospect
- [x] Apply 5% bonus for adjacent regions
- [x] Updated scouting engine to use regional bonuses
- [x] Confidence boost for home region evaluations

---

## Phase 3: Intelligence & Strategy (3-4 Weeks) ✅ COMPLETE

### 3.1 Scout Accuracy Tracking ✅
- [x] After draft, calculate prediction accuracy for each scout (`scout-accuracy.ts`)
- [x] Track by: overall rating, potential, bust prediction, boom prediction
- [x] Build scout "track record" page showing historical accuracy (`ScoutAccuracyReport.tsx`)
- [x] Add "accuracy rating" that updates based on performance (composite scoring)
- [x] Calculate XP from accurate predictions

### 3.2 CPU Team Scouting AI ✅
- [x] Create `cpu-scouting-ai.ts` with intelligent scout usage
- [x] CPU teams prioritize scouting based on team needs and philosophy
- [x] CPU scouts focus on prospects projected in their draft range
- [x] Generate weekly scouting actions for CPU teams
- [x] CPU big boards generated from their scouting results
- [x] CPU draft decisions informed by their scouting (not omniscient)

### 3.3 Mock Draft Simulator ✅
- [x] Create `mock-draft.ts` simulation engine
- [x] Create `MockDraftSimulator.tsx` UI component
- [x] Run mock drafts based on current intel (25-500 simulations)
- [x] Show probability of prospect being available at your pick
- [x] Aggregate results with expected pick and variance
- [x] Identify value picks (prospects you rank higher than consensus)

### 3.4 Scouting Intel Market
- [ ] Create `scouting_intel_trades` table
- [ ] Allow trading scouting reports between teams
- [ ] Price reports based on prospect projection and detail level
- [ ] CPU teams offer/request intel trades
- [ ] "Leaked report" random events (free intel, sometimes wrong)
- [ ] Track intel provenance (who originally scouted)

### 3.5 Scout Development System ✅
- [x] Create `scout-development.ts` with XP and leveling system
- [x] 10-level progression from Rookie Scout to Legend
- [x] Scouts gain XP from successful predictions
- [x] Level bonuses: evaluation bonus + band reduction
- [x] Contract extension terms based on performance
- [x] Scout retirement/aging system with risk calculation

---

## Phase 4: Draft Day Experience (2-3 Weeks) ✅ COMPLETE

### 4.1 War Room Mode ✅
- [x] Create immersive `WarRoom.tsx` component
- [x] Real-time scout reactions as picks happen
- [x] "He's falling!" alerts when targeted prospects drop
- [x] "Someone's trading up!" warnings based on board movement
- [x] Clock countdown with urgency indicators
- [x] Phone ringing animation for trade offers

### 4.2 Live Draft Board ✅
- [x] Create `DraftBoard.tsx` with real-time updating
- [x] Cross off picked players with team logos
- [x] Highlight "your guys" still available
- [x] Show pick value chart and trade calculator
- [x] Best player available (BPA) suggestions
- [x] Grid and list view modes

### 4.3 Trade Negotiation UI ✅
- [x] Create `TradeNegotiation.tsx` with full trade proposal interface
- [x] AI-suggested fair trade values
- [x] Historical trade comparison ("Similar to Rams/Titans 2016")
- [x] Counter-offer system with builder UI
- [x] Trade urgency timer based on clock
- [x] Pick value chart reference (Jimmy Johnson style)

### 4.4 Draft Grades & Analysis ✅
- [x] Create `draft-grades.ts` grading engine
- [x] Create `DraftGrades.tsx` UI component
- [x] Immediate post-pick grade from "media" perspective
- [x] Compare pick to consensus rankings (value, reach, steal detection)
- [x] Show team need fit analysis
- [x] End-of-round summaries
- [x] Final draft grade report card with team rankings
- [x] Superlatives (best draft, best pick, biggest steal/reach)

---

## Phase 5: Long-term Narrative (4+ Weeks)

### 5.1 Post-Draft Retrospective
- [ ] Year 1 performance tracking for all draftees
- [ ] Compare actual performance to scouted projections
- [ ] "Best picks" and "worst picks" analysis
- [ ] Scout accuracy report for the class
- [ ] Update scout reputation based on results

### 5.2 Multi-Year Draft Stories
- [ ] Track "your guys" you missed on
- [ ] Rivalry narratives (team that drafted player you wanted)
- [ ] Bust/boom reveal moments during season
- [ ] "Remember when you passed on..." callbacks
- [ ] Dynasty draft history page

### 5.3 Scouting Achievements
- [ ] "Diamond in the Rough" - late round pick becomes star
- [ ] "Crystal Ball" - scout prediction within 2 points
- [ ] "Trade Heist" - trade up for player who outperforms slot
- [ ] "Bust Avoided" - correctly identified character concerns
- [ ] Achievement gallery and progression

### 5.4 National Scouting Combine Event
- [ ] Special combine week with all prospects
- [ ] Live measurable reveals (40 time, bench, vertical)
- [ ] Interview scheduling with limited slots
- [ ] Media buzz and stock risers/fallers
- [ ] Combine performance affects draft stock

---

## Technical Debt & Infrastructure

### Database Schema Updates
- [x] Add `personality_type` to `scouts` table
- [x] Add `region` to `scouts` table
- [x] Add `college_conference` to `draft_prospects` table
- [x] Create `team_big_boards` table
- [x] Create `scout_accuracy_history` table
- [ ] Create `scouting_intel_trades` table
- [ ] Create `draft_retrospectives` table
- [ ] Add `experience_points` to `scouts` table

### API Endpoints Needed
- [x] `POST /api/big-board` - save/update big board
- [x] `GET /api/big-board` - retrieve big board
- [x] `GET/POST/PATCH /api/scout-disagreements` - manage disagreements
- [ ] `POST /api/scouting/compare` - compare prospects
- [ ] `GET /api/scouting/calendar` - get scouting calendar
- [ ] `POST /api/scouting/mock-draft` - run mock simulation
- [ ] `GET /api/scouts/:id/accuracy` - scout accuracy history
- [ ] `POST /api/scouting/intel-trade` - propose intel trade

### UI Components Built ✅
- [x] `ScoutingReportCard.tsx` - Visual report card with letter grades
- [x] `BigBoard.tsx` - Prospect ranking with tiers
- [x] `ProspectComparison.tsx` - Side-by-side comparison
- [x] `ScoutManagement.tsx` - Scout hiring and priority UI
- [x] `ScoutingCalendar.tsx` - Calendar with phase-based actions
- [x] `ScoutDisagreements.tsx` - Conflicting opinion notifications
- [x] `ScoutAccuracyReport.tsx` - Scout performance tracking
- [x] `MockDraftSimulator.tsx` - Mock draft with simulations

### UI Components (Phase 4) ✅
- [x] `WarRoom.tsx` - Immersive draft day war room
- [x] `DraftBoard.tsx` - Live updating draft board
- [x] `TradeNegotiation.tsx` - Full trade proposal interface
- [x] `DraftGrades.tsx` - Draft grades and analysis display

### Testing Requirements
- [ ] Unit tests for scout personality voice generation
- [ ] Unit tests for accuracy calculation with regional bonuses
- [ ] Integration tests for big board CRUD operations
- [ ] Integration tests for mock draft simulator
- [ ] E2E tests for full scouting -> draft flow
- [ ] Performance tests for 500+ prospect draft classes

---

## Priority Matrix

| Task | Impact | Effort | Priority | Status |
|------|--------|--------|----------|--------|
| Scout Personality System | High | Medium | P1 | ✅ |
| Big Board Builder | High | Medium | P1 | ✅ |
| Scouting Report Cards | High | Low | P1 | ✅ |
| Scout Assignment UI | Medium | Low | P1 | ✅ |
| Scout Disagreement System | High | Medium | P2 | ✅ |
| Scouting Calendar | Medium | Low | P2 | ✅ |
| Prospect Comparison | Medium | Medium | P2 | ✅ |
| Regional Scout Bonuses | Medium | Low | P2 | ✅ |
| CPU Team Scouting AI | High | High | P2 | ✅ |
| War Room Mode | High | High | P3 | ✅ |
| Mock Draft Simulator | Medium | High | P3 | ✅ |
| Scout Accuracy Tracking | Medium | Medium | P3 | ✅ |
| Scouting Intel Market | Medium | High | P4 | ⏳ |
| Post-Draft Retrospective | Medium | Medium | P4 | ⏳ |
| Multi-Year Stories | Low | High | P5 | ⏳ |

---

## Success Metrics

### Engagement Metrics
- [ ] Average time spent on scouting pages (target: 15+ min/session)
- [ ] Big board usage rate (target: 80% of users create boards)
- [ ] Scouting actions per draft class (target: 50+ per user)
- [ ] Mock draft simulations run (target: 10+ per user pre-draft)

### Quality Metrics
- [ ] Scout personality variety (no two scouts feel the same)
- [ ] Meaningful disagreements (20%+ of prospects have conflicting reports)
- [ ] CPU drafts feel realistic (not perfect information)
- [ ] Draft day tension (users report excitement/nervousness)

### Retention Metrics
- [ ] Return rate after first draft (target: 70%+)
- [ ] Multi-season save games (target: 3+ seasons average)
- [ ] Feature discovery rate (users find and use advanced features)

---

## Files Created in Phase 1, 2 & 3

### Core Library Files (Phase 1 & 2)
- `lib/scouting/scout-personality.ts` - Voice templates and personality generation
- `lib/scouting/archetype-multipliers.ts` - Updated with regional bonus system

### Core Library Files (Phase 3)
- `lib/scouting/scout-accuracy.ts` - Prediction accuracy tracking and calculation
- `lib/scouting/scout-development.ts` - XP system, leveling, contracts, retirement
- `lib/scouting/mock-draft.ts` - Mock draft simulation engine
- `lib/scouting/cpu-scouting-ai.ts` - CPU team scouting behavior and big boards

### Components (Phase 1 & 2)
- `app/components/ScoutingReportCard.tsx` - Visual report cards
- `app/components/BigBoard.tsx` - Draft board ranking
- `app/components/ScoutManagement.tsx` - Scout hiring UI
- `app/components/ScoutingCalendar.tsx` - Calendar with phases
- `app/components/ProspectComparison.tsx` - Side-by-side comparison
- `app/components/ScoutDisagreements.tsx` - Disagreement notifications

### Components (Phase 3)
- `app/components/ScoutAccuracyReport.tsx` - Scout performance tracking with charts
- `app/components/MockDraftSimulator.tsx` - Mock draft UI with availability probabilities

### Core Library Files (Phase 4)
- `lib/draft/draft-utils.ts` - Draft day utilities (pick values, trade evaluation, alerts)
- `lib/draft/draft-grades.ts` - Draft grading engine with value/need/talent scoring

### Components (Phase 4)
- `app/components/WarRoom.tsx` - Immersive war room with clock, alerts, scout reactions
- `app/components/DraftBoard.tsx` - Live draft board with grid/list views
- `app/components/TradeNegotiation.tsx` - Trade proposal interface with counter-offers
- `app/components/DraftGrades.tsx` - Draft grades UI with filters and superlatives

### API Routes
- `app/api/big-board/route.ts` - Big board CRUD
- `app/api/scout-disagreements/route.ts` - Disagreement management

### Database
- `supabase/migrations/20250119_add_scout_personality_bigboard.sql` - All new tables

---

## Notes & Ideas Parking Lot

_Future ideas that didn't make the main list:_

- Private workouts with individual prospects
- Injury scouting (MRI reports, medical red flags)
- Character investigations (off-field concerns)
- International scouting (CFL, XFL prospects)
- UDFA scouting post-draft
- Scouting combine mini-games
- Scout press conferences
- Draft day trade rumors feed
- "Mel Kiper" mock draft comparison
- Franchise tag/extension projections
- Prospect social media personalities
- Weather effects on pro days
- Scout travel budget management

---

*Last Updated: January 2025*
*Version: 4.0 - Phase 1, 2, 3 & 4 Complete*
