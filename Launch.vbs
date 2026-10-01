Option Explicit
' Portable launcher. Keep this file beside index.html.
Dim fso, shell, entry
On Error Resume Next
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
If Err.Number <> 0 Then
  MsgBox Err.Description, vbCritical, "Flow Maker"
  WScript.Quit 1
End If
entry = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "index.html")
If Not fso.FileExists(entry) Then
  MsgBox "index.html is missing. Extract the complete ZIP first.", vbCritical, "Flow Maker"
  WScript.Quit 1
End If
shell.Run Chr(34) & entry & Chr(34), 1, False
If Err.Number <> 0 Then
  MsgBox "Cannot open Flow Maker." & vbCrLf & Err.Description, vbCritical, "Flow Maker"
  WScript.Quit 1
End If
