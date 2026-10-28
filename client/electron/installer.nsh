!macro customInit
  IfFileExists "$LOCALAPPDATA\Programs\DropWire\Uninstall DropWire.exe" already_installed not_installed

  already_installed:
    MessageBox MB_YESNOCANCEL|MB_ICONQUESTION "DropWire is already installed on your computer.$\r$\n$\r$\nClick YES to UNINSTALL DropWire and wipe all data.$\r$\nClick NO to Reinstall / Update DropWire.$\r$\nClick CANCEL to exit." IDYES uninstall_dropwire IDNO not_installed
    Quit

  uninstall_dropwire:
    ExecWait '"$LOCALAPPDATA\Programs\DropWire\Uninstall DropWire.exe" /S'
    RMDir /r "$APPDATA\DropWire"
    RMDir /r "$LOCALAPPDATA\Programs\DropWire"
    Delete "$DESKTOP\DropWire.lnk"
    MessageBox MB_OK|MB_ICONINFORMATION "DropWire has been completely uninstalled from your computer."
    Quit

  not_installed:
!macroend