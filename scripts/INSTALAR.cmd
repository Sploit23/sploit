@echo off
title Instalar Sploit
echo ==========================================
echo   Instalando o Sploit neste PC...
echo   (feche esta janela apenas no fim)
echo ==========================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-sploit.ps1"
echo.
echo ==========================================
if %errorlevel%==0 (
  echo   Instalacao concluida com sucesso!
  echo   Abra um terminal NOVO e digite: sploit
) else (
  echo   Algo deu errado. Copie a mensagem acima.
  echo   Dica: desbloqueie o arquivo (botao direito - Propriedades -
  echo   desmarcar "Bloquear") e tente de novo.
)
echo ==========================================
echo.
pause
