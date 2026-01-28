@echo off
setlocal EnableDelayedExpansion

:: Deploy web directory to lib5.com
:: Usage: deploy-web.bat [--dry-run]

:: Add Node.js to PATH
set "PATH=%PATH%;C:\Program Files\nodejs"

:: Configuration
set "REMOTE_HOST=rbarn.com"
set "REMOTE_PATH=/var/www/lib5.com"
set "SCRIPT_DIR=%~dp0"
set "LOCAL_PATH=%SCRIPT_DIR%dist"

:: Parse arguments
set "DRY_RUN="
set "SHOW_HELP="
set "SKIP_BUILD="

:parse_args
if "%~1"=="" goto :end_parse
if "%~1"=="--dry-run" set "DRY_RUN=--dry-run"
if "%~1"=="-n" set "DRY_RUN=--dry-run"
if "%~1"=="--skip-build" set "SKIP_BUILD=1"
if "%~1"=="--help" set "SHOW_HELP=1"
if "%~1"=="-h" set "SHOW_HELP=1"
shift
goto :parse_args
:end_parse

:: Show help
if defined SHOW_HELP (
    echo Usage: %~nx0 [--dry-run^|-n] [--skip-build]
    echo.
    echo Options:
    echo   --dry-run, -n    Preview changes without deploying
    echo   --skip-build     Skip npm build step
    echo   --help, -h       Show this help message
    echo.
    echo Requires one of: rsync ^(Git Bash/WSL^), or scp ^(OpenSSH^)
    exit /b 0
)

:: Build the project first (unless skipped)
if not defined SKIP_BUILD (
    echo Building project...
    call npm run build
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Build failed
        exit /b 1
    )
    echo.
)

:: Check if dist directory exists
if not exist "%LOCAL_PATH%\" (
    echo [ERROR] dist directory not found at %LOCAL_PATH%
    echo Run 'npm run build' first or check build configuration.
    exit /b 1
)

if defined DRY_RUN (
    echo [DRY RUN] No files will be transferred
)

echo Deploying to %REMOTE_HOST%:%REMOTE_PATH%
echo Source: %LOCAL_PATH%
echo.

:: Try rsync first (via Git Bash or WSL)
where rsync >nul 2>&1
if %ERRORLEVEL%==0 (
    echo Using rsync...
    rsync -avz --delete --exclude ".DS_Store" --exclude "*.log" %DRY_RUN% "%LOCAL_PATH%/" "%REMOTE_HOST%:%REMOTE_PATH%/"
    goto :done
)

:: Try rsync via Git Bash
if exist "C:\Program Files\Git\usr\bin\rsync.exe" (
    echo Using rsync via Git Bash...
    "C:\Program Files\Git\usr\bin\rsync.exe" -avz --delete --exclude ".DS_Store" --exclude "*.log" %DRY_RUN% "%LOCAL_PATH%/" "%REMOTE_HOST%:%REMOTE_PATH%/"
    goto :done
)

:: Try rsync via WSL
where wsl >nul 2>&1
if %ERRORLEVEL%==0 (
    echo Using rsync via WSL...
    set "WSL_LOCAL=%LOCAL_PATH:\=/%"
    set "WSL_LOCAL=!WSL_LOCAL:C:=/mnt/c!"
    set "WSL_LOCAL=!WSL_LOCAL:D:=/mnt/d!"
    if defined DRY_RUN (
        wsl rsync -avz --delete --exclude ".DS_Store" --exclude "*.log" --dry-run "!WSL_LOCAL!/" "%REMOTE_HOST%:%REMOTE_PATH%/"
    ) else (
        wsl rsync -avz --delete --exclude ".DS_Store" --exclude "*.log" "!WSL_LOCAL!/" "%REMOTE_HOST%:%REMOTE_PATH%/"
    )
    goto :done
)

:: Fallback to scp (no --delete equivalent, full copy)
where scp >nul 2>&1
if %ERRORLEVEL%==0 (
    echo Using scp ^(note: cannot delete remote files, use rsync for full sync^)...
    if defined DRY_RUN (
        echo [DRY RUN] Would copy: %LOCAL_PATH%\* to %REMOTE_HOST%:%REMOTE_PATH%/
    ) else (
        scp -r "%LOCAL_PATH%\*" "%REMOTE_HOST%:%REMOTE_PATH%/"
    )
    goto :done
)

:: No suitable tool found
echo [ERROR] No deployment tool found.
echo Please install one of the following:
echo   - Git for Windows ^(includes rsync^): https://git-scm.com/
echo   - WSL with rsync: wsl --install
echo   - OpenSSH ^(for scp^): Settings ^> Apps ^> Optional Features ^> OpenSSH Client
exit /b 1

:done
echo.
if defined DRY_RUN (
    echo Dry run complete. Run without --dry-run to deploy.
) else (
    echo Deployment complete!
)
exit /b 0
