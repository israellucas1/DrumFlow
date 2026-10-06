@echo off
chcp 65001 >nul
title DrumFlow - rede de casa
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
echo ============================================================
echo  DrumFlow liberado para a rede de casa.
echo  No celular, conectado ao MESMO Wi-Fi, abra o endereco que
echo  aparece abaixo na linha "Network", por exemplo:
echo     http://192.168.1.4:5173
echo  Se o Windows perguntar sobre o firewall, clique em Permitir.
echo  Para desligar, feche esta janela.
echo ============================================================
echo.
call npm.cmd run dev -- --host 0.0.0.0
pause
