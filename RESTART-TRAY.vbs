' Starts rock-scan tray with no console window. Double-click this or RESTART-TRAY.bat.
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
trayDir = root & "\scripts\rock-scan-ocr"
sh.CurrentDirectory = trayDir
sh.Run "pythonw """ & trayDir & "\tray_app.py""", 0, False
