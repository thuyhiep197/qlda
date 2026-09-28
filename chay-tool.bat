@echo off
chcp 65001 >nul
cd /d "%~dp0"
title QLDA - Quan ly du an
if not exist node_modules (
  echo Dang cai dat thu vien lan dau...
  call npm install || goto :err
)
if not exist web\dist (
  echo Dang build giao dien...
  call npm run build || goto :err
)
echo.
echo  QLDA dang chay tai: http://localhost:3001
echo  Dong cua so nay de tat tool.
echo.
start "" http://localhost:3001
call npm start
goto :eof
:err
echo Co loi xay ra, vui long chup man hinh va gui lai.
pause
