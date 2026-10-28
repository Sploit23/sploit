' Launcher silencioso do app de bandeja do Sploit-Forge -- roda o electron.exe
' baixado direto (zip oficial extraído, sem passar por npm/node_modules --
' ver nota no instalador sobre por que), sem abrir janela de console no meio.
Set objShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
objShell.CurrentDirectory = scriptDir
objShell.Run """" & scriptDir & "\electron\electron.exe"" .", 0, False
