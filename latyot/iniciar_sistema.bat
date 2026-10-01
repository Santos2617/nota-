@echo off
title Fraga Sucatas LTDA - Sistema de Gestao e Notas
chcp 65001 > nul
cls
echo =====================================================================
echo           FRAGA SUCATAS LTDA - SISTEMA DE GESTAO E NOTAS
echo =====================================================================
echo.
echo [1/2] Iniciando servidor local na porta 8000...
start "" http://localhost:8000
echo [2/2] Navegador aberto! O servidor continuara em execucao nesta janela.
echo.
echo Para fechar o sistema, basta fechar esta janela.
echo =====================================================================
echo.
python server.py
if errorlevel 1 (
    echo.
    echo Ocorreu um erro ao executar com 'python'. Tentando com 'py'...
    py server.py
)
pause
