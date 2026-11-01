@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js 22 ou superior nao encontrado. Nada foi alterado.
  exit /b 1
)
node "%~dp0prepare-avell.mjs" %*
exit /b %errorlevel%
