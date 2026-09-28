@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Dang build lai giao dien sau khi cap nhat ma nguon...
call npm install && call npm run build && echo Xong. Chay lai chay-tool.bat
pause
