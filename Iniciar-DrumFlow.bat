@echo off
chcp 65001 >nul
title DrumFlow
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao foi encontrado nesta maquina.
  echo Instale a versao LTS em https://nodejs.org e depois abra este arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo Instalando dependencias - so na primeira vez, precisa de internet...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo Falha ao instalar as dependencias. Verifique a internet e tente de novo.
    pause
    exit /b 1
  )
)

echo.
echo Iniciando o DrumFlow... o navegador vai abrir sozinho.
echo Para desligar, feche esta janela.
echo.
call npm.cmd run dev -- --open
pause
