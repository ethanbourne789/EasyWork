$code = @'
[DllImport("user32.dll")]
public static extern int SendMessage(int hWnd, int hMsg, int wParam, int lParam);
'@
Add-Type -MemberDefinition $code -Name "Win32" -Namespace "W32"
[W32.Win32]::SendMessage(0xFFFF, 0x0112, 0xF170, 2)
