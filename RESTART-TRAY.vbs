' Stops any old rock-scan tray, then starts a fresh one (reloads Python code).
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
trayDir = root & "\scripts\rock-scan-ocr"
sh.CurrentDirectory = trayDir

cmd = "cmd /c python """ & trayDir & "\restart_tray.py"""
exitCode = sh.Run(cmd, 0, True)
If exitCode <> 0 Then
    msg = "Rock-scan tray restart failed." & vbCrLf & vbCrLf & _
          "Try START-HERE.bat, or read:" & vbCrLf & _
          sh.ExpandEnvironmentStrings("%TEMP%") & "\dumper-rock-scan-restart.log"
    MsgBox msg, 48, "Dumper Rock Scan"
End If
