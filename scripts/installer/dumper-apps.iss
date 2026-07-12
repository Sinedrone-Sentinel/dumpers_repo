; Dumper Apps Windows installer — compile with Inno Setup 6.
; CI: ISCC.exe /DAppVersion=1.5.0 dumper-apps.iss

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

#define AppName "Dumper Apps"
#define AppPublisher "Dumper's Repo"
#define AppURL "https://dumpers-repo.com"
#define AppExeName "Launch-DumperApps.bat"

[Setup]
AppId={{A7B3C9D1-4E2F-5A6B-8C0D-1E2F3A4B5C6D}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={localappdata}\Dumper Apps
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=DumperApps-Setup-{#AppVersion}
SetupIconFile=tray.ico
UninstallDisplayIcon={app}\tray.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
VersionInfoVersion={#AppVersion}.0

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "launchapp"; Description: "Launch Dumper Apps after install"; GroupDescription: "Post-install:"; Flags: checkedonce

[Files]
Source: "staging\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "tray.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\tray.ico"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon; IconFilename: "{app}\tray.ico"

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent; Tasks: launchapp

[Messages]
WelcomeLabel2=This installs Dumper Apps on your PC:%n%n• Syncs blueprint unlocks from Star Citizen%n• Powers Live Mission Tracker%n%nAfter install, paste your API key from the site when prompted.
