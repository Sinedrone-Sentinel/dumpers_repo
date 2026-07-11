' Restart rock-scan tray using the bundled Python next to this script.
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
python = root & "\python-venv\Scripts\python.exe"
If Not fs.FileExists(python) Then python = root & "\python\python.exe"
trayDir = root & "\scripts\rock-scan-ocr"
restart = trayDir & "\restart_tray.py"

If Not fs.FileExists(python) Then
    MsgBox "Bundled Python not found. Reinstall Dumper Apps from the site.", 48, "Dumper Apps"
    WScript.Quit 1
End If

sh.CurrentDirectory = trayDir
exitCode = sh.Run("""" & python & """ """ & restart & """", 0, True)
If exitCode <> 0 Then
    MsgBox "Tray restart failed. Log: " & sh.ExpandEnvironmentStrings("%TEMP%") & "\dumper-rock-scan-restart.log", 48, "Dumper Apps"
End If
