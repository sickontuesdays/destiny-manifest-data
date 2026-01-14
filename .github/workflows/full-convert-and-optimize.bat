@echo off
setlocal enabledelayedexpansion
title Destiny 2 Full Manifest Converter and GitHub Deployer
echo ========================================================
echo Destiny 2 Full Manifest Converter and GitHub Deployer
echo ========================================================
echo.

:: Configuration - Support drag and drop
set "DEST_REPO_DIR=C:\Users\mrlit\Desktop\GCC\destiny-manifest-data"
set "CONVERTER_DIR=%~dp0"

:: Check if file was dragged onto the batch file
if "%~1"=="" (
    echo 📁 No file dragged - using default locations...
    set "SOURCE_MANIFEST_DIR=C:\Users\mrlit\Desktop\GCC\Resources and Tools\updated manifest\manifest"
    set "MANIFEST_FILE=C:\Users\mrlit\Desktop\GCC\Resources and Tools\updated manifest\manifest.content"
) else (
    echo 🎯 File dragged onto converter: "%~1"
    set "MANIFEST_FILE=%~1"

    :: Get the directory where the dragged file is located
    set "DRAG_DIR=%~dp1"
    set "SOURCE_MANIFEST_DIR=%DRAG_DIR%manifest"

    echo 📁 Drag and drop mode activated
    echo 📂 Manifest file: "%MANIFEST_FILE%"
    echo 📂 Output will be: "%SOURCE_MANIFEST_DIR%"
)

echo.
echo 🔍 Configuration:
echo   Manifest file: "%MANIFEST_FILE%"
echo   Output folder: "%SOURCE_MANIFEST_DIR%"
echo.

:: Check if source manifest exists (but not for drag-and-drop mode)
if "%~1"=="" (
    :: Only check for existing manifest folder if NOT in drag-and-drop mode
    if not exist "%SOURCE_MANIFEST_DIR%" (
        echo ❌ Source manifest folder not found!
        echo.
        echo Expected folder: "%SOURCE_MANIFEST_DIR%"
        echo.
        echo Please ensure the manifest has been converted to this location.
        echo If you need to convert from scratch, the source file should be at:
        echo "%MANIFEST_FILE%"
        echo.
        pause
        exit /b 1
    )
) else (
    :: In drag-and-drop mode, create output directory if needed
    if not exist "%SOURCE_MANIFEST_DIR%" (
        mkdir "%SOURCE_MANIFEST_DIR%"
        echo 📁 Created output directory: "%SOURCE_MANIFEST_DIR%"
    )
)

:: Check if destination repository exists
if not exist "%DEST_REPO_DIR%" (
    echo ❌ Destination repository folder not found!
    echo.
    echo Expected folder: "%DEST_REPO_DIR%"
    echo.
    echo Please make sure the destiny-manifest-data repository is cloned to this location.
    echo.
    pause
    exit /b 1
)

:: Count files in source
for /f %%A in ('dir /b "%SOURCE_MANIFEST_DIR%\*.json" 2^>nul ^| find /c /v ""') do set "SOURCE_COUNT=%%A"

if "%~1"=="" (
    echo ✅ Found source manifest folder with %SOURCE_COUNT% JSON files
) else (
    echo ✅ Found/created output directory: "%SOURCE_MANIFEST_DIR%" (%SOURCE_COUNT% existing JSON files)
)
echo ✅ Destination repository found at: "%DEST_REPO_DIR%"
echo.

:: Check if we need to do conversion first (if manifest.content exists and is newer)
set "NEEDS_CONVERSION=false"

if exist "%MANIFEST_FILE%" (
    echo 🔄 Checking if conversion is needed...

    :: Check if source manifest.content is newer than converted files
    for %%F in ("%MANIFEST_FILE%") do set "MANIFEST_DATE=%%~tF"

    :: Find newest JSON file in manifest folder
    set "NEWEST_JSON_DATE="
    for /f "delims=" %%F in ('dir "%SOURCE_MANIFEST_DIR%\*.json" /b /od 2^>nul') do (
        for %%G in ("%SOURCE_MANIFEST_DIR%\%%F") do set "NEWEST_JSON_DATE=%%~tG"
    )

    if defined NEWEST_JSON_DATE (
        echo   Manifest file date: %MANIFEST_DATE%
        echo   Newest JSON date:   %NEWEST_JSON_DATE%
        echo.
        echo ⏭️  Using existing converted files (conversion not needed)
    ) else (
        echo   No JSON files found, conversion required
        set "NEEDS_CONVERSION=true"
    )
) else (
    if %SOURCE_COUNT% equ 0 (
        if "%~1"=="" (
            :: Default mode - require either manifest.content or existing files
            echo ❌ No manifest.content file and no existing JSON files found!
            echo.
            echo Please either:
            echo   1. Place manifest.content at: "%MANIFEST_FILE%"
            echo   2. Or ensure JSON files exist in: "%SOURCE_MANIFEST_DIR%"
            echo.
            pause
            exit /b 1
        ) else (
            :: Drag-and-drop mode - this is expected, force conversion
            echo ✅ Fresh conversion mode - will convert dragged manifest file
            set "NEEDS_CONVERSION=true"
        )
    ) else (
        echo ⏭️  Using existing converted files (%SOURCE_COUNT% files found)
    )
)

:: Perform conversion if needed
if "%NEEDS_CONVERSION%"=="true" (
    echo.
    echo 🔄 Converting manifest to JSON with chunking support...
    echo.

    :: Check dependencies
    where node >nul 2>nul
    if %errorlevel% neq 0 (
        echo ❌ Error: Node.js is not installed or not in PATH!
        echo Please install Node.js from https://nodejs.org
        pause
        exit /b 1
    )

    :: Check if convert-manifest.js exists
    if not exist "%CONVERTER_DIR%convert-manifest.js" (
        echo ❌ Error: convert-manifest.js not found in "%CONVERTER_DIR%"
        pause
        exit /b 1
    )

    :: Run conversion
    node "%CONVERTER_DIR%convert-manifest.js" "%MANIFEST_FILE%" "%SOURCE_MANIFEST_DIR%"

    if %errorlevel% neq 0 (
        echo ❌ Conversion failed!
        pause
        exit /b 1
    )

    echo ✅ Conversion completed successfully!
    echo.
)

:: GitHub Deployment Phase
echo.
echo ================================================
echo 📦 Starting GitHub Deployment Process
echo ================================================
echo.

:: Clean destination repository (keep .git folder)
echo 🧹 Cleaning destination repository...
if exist "%DEST_REPO_DIR%\*.json" (
    del /q "%DEST_REPO_DIR%\*.json" >nul 2>nul
)
echo   ✅ Cleaned old JSON files

:: Copy files to repository (exclude manifest_combined.json)
echo.
echo 📋 Copying files to repository...

set "COPIED_COUNT=0"
set "SKIPPED_COUNT=0"
set "CHUNKED_COUNT=0"

for %%F in ("%SOURCE_MANIFEST_DIR%\*.json") do (
    set "FILENAME=%%~nxF"

    :: Skip manifest_combined.json (too large for GitHub)
    if /i "!FILENAME!"=="manifest_combined.json" (
        echo   ⏭️  Skipped !FILENAME! (excluded from GitHub upload)
        set /a SKIPPED_COUNT+=1
    ) else (
        copy "%%F" "%DEST_REPO_DIR%\" >nul 2>nul
        if !errorlevel! equ 0 (
            :: Check if it's a chunked file
            echo !FILENAME! | findstr "_part" >nul
            if !errorlevel! equ 0 (
                echo   📦 Copied chunked file: !FILENAME!
                set /a CHUNKED_COUNT+=1
            ) else (
                echo   ✅ Copied: !FILENAME!
            )
            set /a COPIED_COUNT+=1
        ) else (
            echo   ❌ Failed to copy: !FILENAME!
        )
    )
)

echo.
echo 📊 File copying summary:
echo   ✅ Files copied:    %COPIED_COUNT%
echo   📦 Chunked files:   %CHUNKED_COUNT%
echo   ⏭️  Files skipped:   %SKIPPED_COUNT%
echo.

:: Git operations
echo ===============================================
echo 🔧 Git Operations
echo ===============================================
echo.

:: Change to repository directory
cd /d "%DEST_REPO_DIR%"

:: Check if this is a git repository
if not exist ".git" (
    echo ❌ Not a Git repository!
    echo.
    echo Please ensure "%DEST_REPO_DIR%" is a valid Git repository.
    echo You may need to run: git clone https://github.com/USERNAME/destiny-manifest-data
    pause
    exit /b 1
)

:: Check git status
echo 📋 Checking repository status...
git status --porcelain >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Git command failed! Please check your Git installation.
    pause
    exit /b 1
)

:: Show current status
echo.
git status --short
echo.

:: Stage all changes
echo 🔄 Staging files...
git add .

if %errorlevel% neq 0 (
    echo ❌ Failed to stage files!
    pause
    exit /b 1
)

:: Generate commit message with timestamp
for /f %%i in ('powershell -command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"') do set "COMMIT_TIMESTAMP=%%i"
set "COMMIT_MSG=Update Destiny 2 manifest data - %COMMIT_TIMESTAMP%"

echo ✅ Files staged successfully
echo.

:: Commit changes
echo 💾 Committing changes...
echo Commit message: "%COMMIT_MSG%"
echo.

git commit -m "%COMMIT_MSG%"

if %errorlevel% neq 0 (
    echo ⚠️  Commit failed or no changes to commit
    echo.

    :: Check if there are actually any changes
    git diff --cached --exit-code >nul 2>nul
    if %errorlevel% equ 0 (
        echo ℹ️  No changes detected - repository is already up to date
        echo.
        goto :finish
    ) else (
        echo ❌ Commit failed for unknown reason
        pause
        exit /b 1
    )
)

echo ✅ Changes committed successfully
echo.

:: Push to GitHub
echo 🚀 Pushing to GitHub...
git push

if %errorlevel% neq 0 (
    echo ❌ Push failed!
    echo.
    echo This might be due to:
    echo   • Network connectivity issues
    echo   • Authentication problems
    echo   • Repository permissions
    echo   • Large file size (>100MB files detected?)
    echo.
    echo Please check your GitHub authentication and try again.
    pause
    exit /b 1
)

echo ✅ Successfully pushed to GitHub!
echo.

:finish
:: Success summary
echo ================================================
echo 🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!
echo ================================================
echo.
echo 📊 Summary:
echo   • Source manifest folder: "%SOURCE_MANIFEST_DIR%"
echo   • Files processed:        %COPIED_COUNT%
echo   • Chunked files:          %CHUNKED_COUNT%
echo   • Repository updated:     "%DEST_REPO_DIR%"
echo   • GitHub status:          ✅ Pushed successfully
echo.
echo 🌐 Files should now be accessible at:
echo   https://raw.githubusercontent.com/sickontuesdays/destiny-manifest-data/main/
echo.
echo Key files for build crafter:
echo   • DestinySocketCategoryDefinition.json
echo   • DestinyInventoryItemDefinition_part1.json (if chunked)
echo   • All other definition files
echo.

:: Return to original directory
cd /d "%CONVERTER_DIR%"

echo ✅ Deployment process complete!
echo.
pause