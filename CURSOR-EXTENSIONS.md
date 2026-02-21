# Cursor Extensions Setup for Gridiron GM

This document lists the recommended Cursor extensions for building a strategy/simulation game like Out of the Park Baseball.

## 📦 Installed Extensions

The `.vscode/extensions.json` file has been created with recommended extensions. Cursor will prompt you to install them when you open the project.

### Essential Extensions

1. **ESLint** (`dbaeumer.vscode-eslint`)
   - JavaScript/TypeScript linting
   - Already configured in your project

2. **Prettier** (`esbenp.prettier-vscode`)
   - Code formatter
   - Auto-formats on save (configured)

3. **Error Lens** (`usernamehw.errorlens`)
   - Shows errors inline in your code
   - No need to check the Problems panel constantly

4. **GitLens** (`eamodio.gitlens`)
   - Enhanced Git capabilities
   - See who changed what and when

5. **Thunder Client** (`rangav.vscode-thunder-client`)
   - Test API routes directly in Cursor
   - Like Postman but built-in

6. **Tailwind CSS IntelliSense** (`bradlc.vscode-tailwindcss`)
   - Autocomplete for Tailwind classes
   - Shows color previews

7. **ES7+ React/Redux/React-Native Snippets** (`dsznajder.es7-react-js-snippets`)
   - Quick code snippets for React
   - Type `rafce` for a React component

8. **Auto Rename Tag** (`formulahendry.auto-rename-tag`)
   - Automatically renames paired HTML/JSX tags

9. **Path Intellisense** (`christian-kohler.path-intellisense`)
   - Autocomplete for file paths
   - Makes imports easier

10. **Supabase** (`supabase.supabase-vscode`)
    - Official Supabase extension
    - Database management and queries

11. **SQLTools** (`mtxr.sqltools`)
    - Database client
    - Run SQL queries directly in Cursor

12. **SQLTools PostgreSQL Driver** (`mtxr.sqltools-driver-pg`)
    - PostgreSQL driver for SQLTools

13. **Code Spell Checker** (`streetsidesoftware.code-spell-checker`)
    - Catches typos in code and comments

14. **Indent Rainbow** (`oderwat.indent-rainbow`)
    - Colorizes indentation
    - Makes nested code easier to read

15. **Trailing Spaces** (`shardulm94.trailing-spaces`)
    - Highlights trailing whitespace
    - Keeps code clean

16. **TypeScript** (`ms-vscode.vscode-typescript-next`)
    - Enhanced TypeScript support

## 🚀 How to Install

1. Open Cursor
2. Open this project
3. Cursor will show a notification: "This workspace has extension recommendations"
4. Click "Install All" or "Show Recommendations"
5. Install the extensions you want

Or manually:
1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows)
2. Type "Extensions: Show Recommended Extensions"
3. Install the ones you want

## ⚙️ Settings

The `.vscode/settings.json` file has been configured with:
- Format on save (Prettier)
- ESLint auto-fix on save
- Tailwind CSS IntelliSense
- TypeScript workspace settings

## 🎯 Most Important for Your Game

For building a strategy/simulation game, these are the most valuable:

1. **Supabase Extension** - Manage your database
2. **Thunder Client** - Test API routes (`/api/generate-schedule`, etc.)
3. **Error Lens** - See errors immediately
4. **GitLens** - Track changes and history
5. **Tailwind CSS IntelliSense** - Faster UI development

## 📝 Usage Tips

### Thunder Client
- Create requests to test your API routes
- Save collections of requests
- Test schedule generation, player creation, etc.

### SQLTools
- Connect to your Supabase database
- Run queries to check data
- View table structures

### Error Lens
- Errors appear inline with your code
- Hover to see full error details
- Fix issues faster

### GitLens
- See git blame inline
- View file history
- Compare changes

## 🔧 Additional Tools

You might also want to consider:
- **REST Client** - Alternative to Thunder Client (uses `.http` files)
- **Excel Viewer** - View CSV files (for draft classes, exports)
- **Markdown Preview Enhanced** - Better markdown preview

All extensions are optional - install only what you need!



