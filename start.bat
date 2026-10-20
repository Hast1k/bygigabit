@echo off
echo ==========================================
echo   Starting ByGigaBit Web on port 8080...
echo   Opening: http://localhost:8080/chart
echo ==========================================
start http://localhost:8080/chart
python app.py
pause
