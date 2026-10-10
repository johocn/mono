@echo off
cd /d d:\zhao\xiaoxiaole
start "brain-garden" /min npx http-server bin -p 8099 -c-1 --cors
exit
