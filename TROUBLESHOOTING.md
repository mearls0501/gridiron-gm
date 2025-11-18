# Troubleshooting - Not Seeing Changes

## Quick Fixes

### 1. **Hard Refresh Your Browser**
- **Chrome/Edge**: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- **Firefox**: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)
- **Safari**: `Cmd+Option+R`

### 2. **Restart the Dev Server**
```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

### 3. **Clear Next.js Cache**
```bash
rm -rf .next
npm run dev
```

### 4. **Check Browser Console**
Open browser DevTools (F12) and check the Console tab for errors.

### 5. **Verify You're on the Right Pages**
The changes are visible on:
- **Players Page**: `/players` - Should have sortable table, search icon, filter icon
- **Team Page**: `/teams/[id]` - Should have pie chart and formatted currency
- **Home Page**: `/` - Should have icons instead of SVG

## What to Look For

### Players Page (`/players`)
✅ **Icons**: Search icon in search box, Filter icon in filter section, Users icon in header
✅ **Sortable Columns**: Click any column header (Name, Pos, OVR, POT, Age, Y1) - should show up/down arrows
✅ **Currency Formatting**: Salaries should show as `$25.5M` instead of `$25,500,000`
✅ **Search**: Should have a search icon on the left side of the input

### Team Page (`/teams/[id]`)
✅ **Pie Chart**: Visual chart showing salary cap distribution by position
✅ **Formatted Currency**: All dollar amounts formatted nicely
✅ **Icons**: DollarSign, Users, TrendingUp icons
✅ **Progress Bars**: Visual bars showing cap by position

### Home Page (`/`)
✅ **Icons**: Building2, Users, Trophy icons in stats cards
✅ **Icons**: Calendar, Clock icons in event cards
✅ **Icons**: Icons next to each quick action link

## Common Issues

### Issue: "Module not found" errors
**Solution**: 
```bash
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Issue: TypeScript errors
**Solution**: The TypeScript errors have been fixed. If you still see them:
```bash
npx tsc --noEmit
```

### Issue: Changes not showing after refresh
**Solution**: 
1. Check browser console for errors
2. Try incognito/private browsing mode
3. Clear browser cache completely
4. Restart dev server

### Issue: Icons not showing
**Solution**: 
- Make sure `lucide-react` is installed: `npm list lucide-react`
- Check browser console for import errors
- Try hard refresh (Cmd+Shift+R)

### Issue: Table not sortable
**Solution**:
- Make sure you're clicking the column headers
- Check browser console for errors
- Verify `@tanstack/react-table` is installed: `npm list @tanstack/react-table`

### Issue: Chart not showing
**Solution**:
- Check browser console for errors
- Make sure team has players with contracts
- Verify `recharts` is installed: `npm list recharts`

## Verify Installation

Run these commands to verify packages are installed:

```bash
npm list @tanstack/react-table
npm list recharts
npm list lucide-react
npm list use-debounce
npm list numeral
npm list zustand
```

All should show version numbers, not "empty" or errors.

## Still Not Working?

1. **Check the terminal** where `npm run dev` is running - are there any errors?
2. **Check browser console** (F12) - are there any red errors?
3. **Try a different browser** - rule out browser-specific issues
4. **Check the Network tab** - are files loading correctly?

## Expected Behavior

### Players Page
- When you click a column header, it should:
  - Show an up arrow (ascending)
  - Show a down arrow (descending)  
  - Sort the table rows
- Search box should have a search icon on the left
- Currency values should be formatted (e.g., `$25.5M`)

### Team Page  
- Should show a colorful pie chart
- Hovering over chart segments shows tooltips
- Progress bars show cap allocation by position
- All dollar amounts formatted nicely

### Home Page
- Stats cards have icons (Building2, Users, Trophy)
- Event cards have icons (Calendar, Clock)
- Quick action links have icons next to them

