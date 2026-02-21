#!/bin/bash

# Quick script to check if player stats tables have save_game_id column
# This helps diagnose why stats aren't saving

echo "==================================================================="
echo "Checking Player Stats Table Schema"
echo "==================================================================="
echo ""

# Check if server is running
echo "1. Checking if development server is running..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "   ✅ Server is running"
else
    echo "   ❌ Server is NOT running"
    echo "   Please start your dev server with: npm run dev"
    exit 1
fi

echo ""
echo "2. Running schema diagnostic..."
echo ""

# Run the diagnostic endpoint
RESPONSE=$(curl -s http://localhost:3000/api/diagnose-stats-schema)

# Check if response is valid JSON
if echo "$RESPONSE" | jq . > /dev/null 2>&1; then
    echo "   Diagnostic completed successfully"
    echo ""
    
    # Extract key information
    STATUS=$(echo "$RESPONSE" | jq -r '.status')
    GAME_STATS_HAS_SAVE_ID=$(echo "$RESPONSE" | jq -r '.report.tables.player_game_stats.has_save_game_id')
    SEASON_STATS_HAS_SAVE_ID=$(echo "$RESPONSE" | jq -r '.report.tables.player_season_stats.has_save_game_id')
    GAME_STATS_COUNT=$(echo "$RESPONSE" | jq -r '.report.tables.player_game_stats.record_count')
    
    echo "==================================================================="
    echo "RESULTS"
    echo "==================================================================="
    echo ""
    echo "Overall Status: $STATUS"
    echo ""
    echo "Table Status:"
    echo "  - player_game_stats.save_game_id: $GAME_STATS_HAS_SAVE_ID"
    echo "  - player_season_stats.save_game_id: $SEASON_STATS_HAS_SAVE_ID"
    echo "  - Game stats records: $GAME_STATS_COUNT"
    echo ""
    
    # Show issues if any
    ISSUES=$(echo "$RESPONSE" | jq -r '.report.issues[]' 2>/dev/null)
    if [ ! -z "$ISSUES" ]; then
        echo "==================================================================="
        echo "ISSUES FOUND"
        echo "==================================================================="
        echo "$ISSUES"
        echo ""
    fi
    
    # Show recommendations
    RECOMMENDATIONS=$(echo "$RESPONSE" | jq -r '.report.recommendations[]' 2>/dev/null)
    if [ ! -z "$RECOMMENDATIONS" ]; then
        echo "==================================================================="
        echo "RECOMMENDED ACTIONS"
        echo "==================================================================="
        echo "$RECOMMENDATIONS"
        echo ""
    fi
    
    # Show full report if there are issues
    if [ "$STATUS" != "healthy" ]; then
        echo ""
        echo "==================================================================="
        echo "FULL DIAGNOSTIC REPORT"
        echo "==================================================================="
        echo "$RESPONSE" | jq .
        echo ""
        echo "See STATS-SAVING-FIX.md for detailed fix instructions"
    else
        echo "✅ All checks passed! Stats tables are properly configured."
    fi
    
else
    echo "   ❌ Failed to get diagnostic response"
    echo "   Response: $RESPONSE"
    exit 1
fi

echo ""
echo "==================================================================="
echo "Done"
echo "==================================================================="



