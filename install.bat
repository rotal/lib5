@echo off
set PATH=C:\Program Files\nodejs;%PATH%
cd /d D:\devl\pe
if exist node_modules rmdir /s /q node_modules
call "C:\Program Files\nodejs\npm.cmd" install
