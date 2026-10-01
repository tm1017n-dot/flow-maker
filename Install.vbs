Option Explicit
' ASCII source is intentional: Windows Script Host must not misread UTF-8 Japanese.
' Offline, per-user installation. No administrator rights or PowerShell needed.
Dim fso, shell, picker, sourceDir, baseDir, targetDir, files, relative, choice
Dim picked, desktopLink, menuDir, appEntry, appIcon
On Error Resume Next
Set fso = CreateObject("Scripting.FileSystemObject")
CheckError "Initialize file access"
Set shell = CreateObject("WScript.Shell")
CheckError "Initialize Windows Shell"
sourceDir = fso.GetParentFolderName(WScript.ScriptFullName)
files = Array("index.html", "styles.css", "app.js", "manual.css", "manual.js", "Launch.vbs", "assets\flow-maker.svg", "assets\flow-maker.ico")
For Each relative In files
  If Not fso.FileExists(fso.BuildPath(sourceDir, relative)) Then
    MsgBox "Missing file: " & relative & vbCrLf & "Extract the complete ZIP before installing.", vbCritical, "Flow Maker"
    WScript.Quit 1
  End If
Next
baseDir = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
If baseDir = "" Or InStr(baseDir, "%") > 0 Then
  MsgBox "Cannot find the local application folder.", vbCritical, "Flow Maker"
  WScript.Quit 1
End If
targetDir = fso.BuildPath(baseDir, "FlowMakerManual")
choice = MsgBox("Install Flow Maker in:" & vbCrLf & targetDir & vbCrLf & vbCrLf & "Yes: use this folder" & vbCrLf & "No: choose another parent folder" & vbCrLf & "Cancel: exit" & vbCrLf & vbCrLf & "Desktop and Start menu shortcuts will be created.", vbYesNoCancel + vbQuestion, "Flow Maker Setup")
If choice = vbCancel Then WScript.Quit 0
If choice = vbNo Then
  Set picker = CreateObject("Shell.Application")
  CheckError "Open folder chooser"
  Set picked = picker.BrowseForFolder(0, "Choose a parent folder for FlowMakerManual", &H41, baseDir)
  CheckError "Choose installation folder"
  If picked Is Nothing Then WScript.Quit 0
  targetDir = fso.BuildPath(picked.Self.Path, "FlowMakerManual")
End If
If LCase(targetDir) = LCase(sourceDir) Then
  MsgBox "Choose a different installation folder.", vbExclamation, "Flow Maker"
  WScript.Quit 1
End If
If fso.FolderExists(targetDir) Then
  If MsgBox("Update the application in:" & vbCrLf & targetDir & vbCrLf & vbCrLf & "Close Flow Maker before continuing. Only bundled application files will be replaced. Your saved JSON files will not be removed.", vbOKCancel + vbQuestion, "Flow Maker Update") <> vbOK Then WScript.Quit 0
End If
EnsureFolder targetDir
EnsureFolder fso.BuildPath(targetDir, "assets")
For Each relative In files
  fso.CopyFile fso.BuildPath(sourceDir, relative), fso.BuildPath(targetDir, relative), True
  CheckError "Copy " & relative
Next
appEntry = fso.BuildPath(targetDir, "index.html")
appIcon = fso.BuildPath(targetDir, "assets\flow-maker.ico")
desktopLink = fso.BuildPath(shell.SpecialFolders("Desktop"), "Flow Maker Manual.lnk")
CheckError "Find desktop folder"
menuDir = fso.BuildPath(shell.SpecialFolders("Programs"), "Flow Maker Manual")
CheckError "Find Start menu folder"
EnsureFolder menuDir
MakeShortcut desktopLink
MakeShortcut fso.BuildPath(menuDir, "Flow Maker Manual.lnk")
MakeShortcut fso.BuildPath(targetDir, "Flow Maker Manual.lnk")
choice = MsgBox("Installation completed." & vbCrLf & targetDir & vbCrLf & vbCrLf & "Open Flow Maker now?", vbYesNo + vbInformation, "Flow Maker")
If choice = vbYes Then
  shell.Run Chr(34) & appEntry & Chr(34), 1, False
  CheckError "Open Flow Maker"
End If
WScript.Quit 0

Sub CheckError(action)
  If Err.Number <> 0 Then
    MsgBox action & " failed." & vbCrLf & Err.Description & vbCrLf & vbCrLf & "Installation stopped. Check folder access and retry.", vbCritical, "Flow Maker"
    WScript.Quit 1
  End If
End Sub

Sub EnsureFolder(path)
  On Error Resume Next
  Dim parent
  If Not fso.FolderExists(path) Then
    parent = fso.GetParentFolderName(path)
    If parent <> "" And Not fso.FolderExists(parent) Then EnsureFolder parent
    fso.CreateFolder path
    CheckError "Create folder " & path
  End If
End Sub

Sub MakeShortcut(path)
  On Error Resume Next
  Dim link
  Set link = shell.CreateShortcut(path)
  CheckError "Create shortcut"
  link.TargetPath = appEntry
  link.WorkingDirectory = targetDir
  link.IconLocation = appIcon & ",0"
  link.Description = "Flow Maker - workflow and manual editor"
  link.Save
  CheckError "Save shortcut " & path
End Sub
