# League Schedule Page - Features & Usage

## 🎯 Purpose
View and troubleshoot the league schedule with detailed filtering and game count tracking.

## 📍 Location
**URL**: `/league/schedule` (accessible via **League → Schedule** in the menu)

## ✨ Key Features

### 1. **Issue Detection Banner**
- Automatically detects teams with incorrect game counts
- Shows which teams don't have exactly 17 games
- Click any team in the alert to view their schedule
- Color-coded: Red for teams with < 17 games

### 2. **Statistics Dashboard**
Shows at-a-glance:
- **Total Games**: Current count vs. expected 272
- **Teams**: Current count vs. expected 32
- **Complete Teams**: How many teams have exactly 17 games
- **Season**: Current season year

### 3. **Team Dropdown Filter**
- **All Teams**: Shows full league schedule
- **By Division**: Teams organized by conference and division
  - AFC East, North, South, West
  - NFC East, North, South, West
- **Game Count**: Shows number of games next to each team
- **Quick Troubleshooting**: Easily see which teams have fewer games

### 4. **Week Filter**
- Filter by specific week (1-18)
- Shows game count per week
- "All Weeks" option to see full schedule

### 5. **Season Filter**
- Change season year
- Automatically reloads schedule for selected season

### 6. **Selected Team Info Panel**
When you select a specific team:
- Shows team name and division
- Displays game count (highlighted if not 17)
- Shows "Complete" or "Missing X game(s)" status
- Team's games are highlighted in blue throughout the schedule

### 7. **Weekly Schedule Display**
- Games organized by week
- Shows matchups: Away Team @ Home Team
- Click on any team name to view their roster
- Games involving selected team are highlighted
- Shows scores for completed games

## 📊 How to Troubleshoot Missing Games

### Step 1: Check the Issue Alert
If teams have missing games, you'll see an orange alert at the top showing which teams are affected.

### Step 2: Select a Problem Team
Click on a team in the alert, or use the dropdown to select them.

### Step 3: Review Their Schedule
- The page will show only that team's games
- You'll see exactly which weeks they play
- The info panel shows how many games they have
- Highlighted games make it easy to spot their matchups

### Step 4: Compare with Other Teams
- Select another team to compare schedules
- Look for patterns (e.g., all teams in a division missing games)
- Check if certain weeks have fewer games

### Step 5: Identify the Gap
- Use the week filter to check each week
- Look for weeks where the team has no game
- Identify if they're missing more than just their bye week

## 🔍 What to Look For

### Normal Schedule:
- ✅ 17 games total per team
- ✅ 1 week with no game (bye week)
- ✅ 2 games against each division opponent
- ✅ 272 total games in the league

### Problem Indicators:
- ❌ Team has < 17 games
- ❌ Total games ≠ 272
- ❌ Multiple teams missing games
- ❌ Certain weeks have very few games

## 💡 Example Workflow

### Scenario: Patriots have 16 games instead of 17

1. **Navigate** to `/league/schedule`
2. **See Alert**: "1 team does not have exactly 17 games"
3. **Click** "New England Patriots" in the alert
4. **Review**: Info panel shows "16 games - Missing 1 game"
5. **Scan Schedule**: Look through all 18 weeks
6. **Find Gap**: Notice they have 2 bye weeks or missing a division game
7. **Report**: You now know exactly what's wrong

### Finding Pattern Issues

If multiple teams are affected:
1. Select "All Teams" in the dropdown
2. Look at the issue alert
3. Check if they're all in the same division
4. Check if they're all in the same conference
5. This helps identify systematic issues in the schedule generator

## 🎨 Visual Indicators

### Colors:
- **Blue highlight**: Selected team's games
- **Orange alert**: Teams with incorrect game counts
- **Red text**: Game count < 17
- **Green text**: Correct counts (✓)

### Game Count Display:
- Next to each team in dropdown: `(16 games)` or `(17 games)`
- In alert: Shows count for each affected team
- In info panel: Large, color-coded count

## 📈 Stats at Top

The four stat boxes show:
1. **Total Games**: Should be 272
2. **Teams**: Should be 32
3. **Complete Teams**: Should be 32
4. **Season**: Current season year

If any stat shows a warning (orange/red), investigate:
- Total Games ≠ 272: Schedule generation incomplete
- Teams ≠ 32: Database issue
- Complete Teams < 32: Some teams missing games

## 🔗 Quick Actions

- **Generate Schedule**: Link in empty state
- **View Team Roster**: Click any team name in schedule
- **Filter by Week**: Dropdown to focus on specific week
- **Filter by Team**: Dropdown to see team's schedule

## 📱 Responsive Design

- Works on desktop, tablet, and mobile
- Dropdowns stack on smaller screens
- Schedule rows adapt to screen size
- Touch-friendly for mobile devices

## ⚙️ Technical Details

### Data Sources:
- `teams` table: All team information
- `games` table: All scheduled games

### Calculations:
- Game counts calculated in real-time
- No caching (always shows current data)
- Automatic updates when filters change

### Performance:
- Efficient filtering on client-side
- Single database query per season
- Fast dropdown operations

## 🎯 Next Steps After Troubleshooting

Once you identify which teams have missing games:

1. **Check Database**: Verify teams exist in database
2. **Check Divisions**: Ensure teams have correct conference/division
3. **Regenerate**: Use Admin → Generate Schedule
4. **Verify**: Return to this page to confirm 272 games

## 🆘 Common Issues

### "No games found"
- Schedule hasn't been generated yet
- Click "Generate Schedule" button
- Or go to Admin → Generate Schedule

### Some teams have 0 games
- Teams might not be in the `teams` table
- Check team IDs match between `teams` and `games` tables

### All teams have wrong counts
- Schedule needs to be regenerated
- Use the schedule generator to create a new schedule

---

**Pro Tip**: Keep this page open while running the schedule generator to immediately verify results!

