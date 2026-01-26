@echo off

echo Step 1: Installing dependencies...
call npm install

echo.
echo Step 2: Starting development server...
call npm run dev

:: This pause only triggers if you manually stop the dev server (Ctrl+C)
pause
