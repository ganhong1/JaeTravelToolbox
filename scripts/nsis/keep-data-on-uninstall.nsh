; `data/` contains user-owned configuration, images, tool packs and Chromium state.
; Updates always preserve it. Interactive uninstall asks the user; silent
; uninstall preserves it unless `--delete-user-data` was supplied.
!macro customUnInstall
  StrCpy $R9 "0"
  ${ifNot} ${isUpdated}
    ${GetParameters} $R0
    ${GetOptions} $R0 "--delete-user-data" $R1
    ${ifNot} ${Errors}
      StrCpy $R9 "1"
    ${else}
      ${ifNot} ${Silent}
        MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON1 "是否保留阿洁的旅行工具箱的用户数据？$\r$\n$\r$\n选择“是”保留配置、项目、图片和工具资源包。$\r$\n选择“否”将一并删除安装目录中的 data 文件夹。" IDYES keepUserData
        StrCpy $R9 "1"
        keepUserData:
      ${endif}
    ${endif}
  ${endif}
!macroend

; This macro replaces electron-builder's blanket `RMDir /r $INSTDIR` removal.
!macro customRemoveFiles
  ; Match electron-builder's removal sequence so a full uninstall can remove
  ; the uninstaller executable after it has switched away from $INSTDIR.
  SetOutPath $TEMP
  ${if} $R9 == "1"
    ; The user explicitly chose a full removal. Keep the stock recursive
    ; behavior so NSIS can also remove its own executable and the root.
    RMDir /r "$INSTDIR"
  ${else}
    RMDir /r "$INSTDIR\app"
    RMDir /r "$INSTDIR\locales"
    RMDir /r "$INSTDIR\resources"

    Delete "$INSTDIR\JaeTravelToolbox.exe"
    Delete "$INSTDIR\Uninstall JaeTravelToolbox.exe"
    Delete "$INSTDIR\chrome_100_percent.pak"
    Delete "$INSTDIR\chrome_200_percent.pak"
    Delete "$INSTDIR\d3dcompiler_47.dll"
    Delete "$INSTDIR\dxcompiler.dll"
    Delete "$INSTDIR\dxil.dll"
    Delete "$INSTDIR\ffmpeg.dll"
    Delete "$INSTDIR\icudtl.dat"
    Delete "$INSTDIR\LICENSE.electron.txt"
    Delete "$INSTDIR\LICENSES.chromium.html"
    Delete "$INSTDIR\resources.pak"
    Delete "$INSTDIR\snapshot_blob.bin"
    Delete "$INSTDIR\v8_context_snapshot.bin"
    Delete "$INSTDIR\vk_swiftshader.dll"
    Delete "$INSTDIR\vk_swiftshader_icd.json"
    Delete "$INSTDIR\vulkan-1.dll"
    RMDir "$INSTDIR"
  ${endif}
!macroend
