!macro NSIS_HOOK_POSTINSTALL
  ; Tauri registers the NVTS-PhotoMania.nvtsphoto ProgID before this hook.
  ; Override only the document type icon; keep PhotoMania's application icon unchanged.
  WriteRegStr SHCTX "Software\Classes\NVTS-PhotoMania.nvtsphoto\DefaultIcon" "" "$\"$INSTDIR\nvtsphoto-pmd.ico$\""
  System::Call 'shell32::SHChangeNotify(i, i, i, i) (0x08000000, 0x1000, 0, 0)'
!macroend
