# A deterministic two-window Win32 test app for the window-selector fixtures
# (ADR 01036) - the app-surface counterpart of the purpose-built pages under
# test/server/public. Real System32 dialog apps all carry confounders:
# odbcad32/osk/eudcedit have highestAvailable/uiAccess manifests (demand
# elevation for admin users), dxdiag gates its buttons behind a hardware scan
# and shows crash-recovery modals, and menu popups are separate top-level
# HWNDs the one-root-window driver can't reach. WinForms gives us titled
# windows and a button with none of that.
Add-Type -AssemblyName System.Windows.Forms

$second = New-Object System.Windows.Forms.Form
$second.Text = "DD Second Window"
$second.StartPosition = "Manual"
$second.Location = New-Object System.Drawing.Point(80, 80)
$second.Size = New-Object System.Drawing.Size(360, 200)
$secondLabel = New-Object System.Windows.Forms.Label
$secondLabel.Text = "Dialog content"
$secondLabel.AutoSize = $true
$secondLabel.Location = New-Object System.Drawing.Point(20, 20)
$second.Controls.Add($secondLabel)
# Closing the second window hides it instead of disposing, so the fixture
# could reopen it; the main window's close ends the app.
$second.Add_FormClosing({ param($s, $e) if ($e.CloseReason -eq "UserClosing") { $e.Cancel = $true; $s.Hide() } })

$main = New-Object System.Windows.Forms.Form
$main.Text = "DD Main Window"
$main.StartPosition = "Manual"
$main.Location = New-Object System.Drawing.Point(40, 40)
$main.Size = New-Object System.Drawing.Size(420, 240)
$button = New-Object System.Windows.Forms.Button
$button.Text = "Open Dialog"
$button.Location = New-Object System.Drawing.Point(20, 20)
$button.Size = New-Object System.Drawing.Size(140, 36)
$button.Add_Click({ $second.Show(); $second.BringToFront() })
$main.Controls.Add($button)
$mainLabel = New-Object System.Windows.Forms.Label
$mainLabel.Text = "Main content"
$mainLabel.AutoSize = $true
$mainLabel.Location = New-Object System.Drawing.Point(20, 80)
$main.Controls.Add($mainLabel)

[System.Windows.Forms.Application]::Run($main)
