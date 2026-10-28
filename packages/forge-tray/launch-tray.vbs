' Launcher silencioso do app de bandeja do FORGE -- roda o electron.exe já
' instalado em node_modules\.bin direto (sem passar por bunx, sem depender
' do bun estar no PATH de quem clicar no ícone da Área de Trabalho), sem
' abrir uma janela de console no meio do caminho.
Set objShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
objShell.CurrentDirectory = scriptDir
objShell.Run """" & scriptDir & "\node_modules\.bin\electron.exe"" .", 0, False
