using System.Windows;
using BpDumperGui.Services;
using Microsoft.Win32;
using Windows.Storage;

namespace BpDumperGui;

public partial class MainWindow : Window
{
    private readonly FolderAccess _folders;
    private string _envPath;
    private string _logPath = "";
    private bool _running;
    private CancellationTokenSource? _runCts;
    private LogWatcherService? _watcher;
    private WebhookClient? _webhook;

    public MainWindow()
    {
        InitializeComponent();
        _folders = new FolderAccess(this);
        _envPath = AppDir.DefaultEnvPath();
        Loaded += OnLoaded;
        Closing += OnClosing;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        AppendLog($"BP Dumper-GUI {DumperVersion.Current} — idle (does not start watching on launch).");
        AppendLog("File → Load Settings for an existing .env, or fill the key / options and File → Save Settings.");
        if (File.Exists(_envPath))
        {
            ApplySettings(EnvFile.Load(_envPath));
            AppendLog($"Loaded {_envPath}");
            await RefreshPathLabelAsync();
        }
        else
        {
            PathLabel.Text = "LIVE path: (none — File → Path to SC)";
            AppendLog("No .env beside the exe yet.");
        }
    }

    private void FileButton_Click(object sender, RoutedEventArgs e)
    {
        FilePopup.IsOpen = true;
    }

    private async void OnClosing(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        await StopRunAsync();
    }

    private EnvSettings ReadUi()
    {
        return new EnvSettings
        {
            LogPath = _logPath,
            ApiKey = ApiKeyBox.Text.Trim(),
            WebhookUrl = "",
            WatchMode = WatchCheck.IsChecked == true,
            ImportOldLogs = ImportRecentCheck.IsChecked == true,
            FullHistoryImport = FullHistoryCheck.IsChecked == true,
        };
    }

    private void ApplySettings(EnvSettings s)
    {
        _logPath = s.LogPath.Trim();
        ApiKeyBox.Text = s.ApiKey;
        WatchCheck.IsChecked = s.WatchMode;
        ImportRecentCheck.IsChecked = s.ImportOldLogs;
        FullHistoryCheck.IsChecked = s.FullHistoryImport;
    }

    private void SetRunningUi(bool running)
    {
        _running = running;
        StartStopButton.Content = running ? "Stop" : "Start";
        LoadMenu.IsEnabled = !running;
        PathMenu.IsEnabled = !running;
        ApiKeyBox.IsEnabled = !running;
        WatchCheck.IsEnabled = !running;
        ImportRecentCheck.IsEnabled = !running;
        FullHistoryCheck.IsEnabled = !running;
    }

    private async void LoadMenu_Click(object sender, RoutedEventArgs e)
    {
        FilePopup.IsOpen = false;
        if (_running)
            return;
        var dlg = new OpenFileDialog
        {
            Title = "Load BP Dumper .env",
            Filter = "Env files (*.env)|*.env|All files (*.*)|*.*",
            FileName = ".env",
        };
        if (dlg.ShowDialog() != true)
            return;
        _envPath = dlg.FileName;
        ApplySettings(EnvFile.Load(_envPath));
        AppendLog($"Loaded {_envPath}");
        await RefreshPathLabelAsync();
    }

    private void SaveMenu_Click(object sender, RoutedEventArgs e)
    {
        FilePopup.IsOpen = false;
        try
        {
            EnvFile.Save(_envPath, ReadUi());
            AppendLog($"Saved {_envPath}");
        }
        catch (Exception ex)
        {
            AppendLog($"Save failed: {ex.Message}");
        }
    }

    private async void PathMenu_Click(object sender, RoutedEventArgs e)
    {
        FilePopup.IsOpen = false;
        if (_running)
            return;
        StorageFolder? folder;
        try
        {
            folder = await _folders.PickLiveFolderAsync(_logPath);
        }
        catch (Exception ex)
        {
            AppendLog("Folder browser failed: " + ex.Message);
            return;
        }

        if (folder is null)
        {
            AppendLog("Folder pick cancelled.");
            return;
        }

        _logPath = folder.Path;
        PathLabel.Text = "LIVE path: " + _logPath;
        AppendLog("Granted folder: " + _logPath);
    }

    private async Task RefreshPathLabelAsync()
    {
        var folder = await _folders.ResolveFolderAsync(_logPath);
        if (folder is not null)
        {
            _logPath = folder.Path;
            PathLabel.Text = "LIVE path: " + _logPath;
        }
        else if (!string.IsNullOrWhiteSpace(_logPath))
        {
            PathLabel.Text = "LIVE path: " + _logPath + " (File → Path to SC to grant access)";
        }
        else
        {
            PathLabel.Text = "LIVE path: (none — File → Path to SC)";
        }
    }

    private async void StartStopButton_Click(object sender, RoutedEventArgs e)
    {
        if (_running)
        {
            await StopRunAsync();
            AppendLog("Stopped.");
            return;
        }

        await StartRunAsync();
    }

    private async Task StartRunAsync()
    {
        var key = ApiKeyBox.Text.Trim();
        if (key.Length == 0 || !key.StartsWith("dr_", StringComparison.Ordinal))
        {
            AppendLog("Enter a valid API key (dr_…) from Dumper Apps on the site.");
            return;
        }

        var folder = await _folders.ResolveFolderAsync(_logPath);
        if (folder is null)
        {
            AppendLog("Choose your LIVE folder with File → Path to SC before starting.");
            return;
        }

        _logPath = folder.Path;
        PathLabel.Text = "LIVE path: " + _logPath;

        try
        {
            EnvFile.Save(_envPath, ReadUi());
        }
        catch (Exception ex)
        {
            AppendLog($"Could not save .env: {ex.Message}");
        }

        _runCts = new CancellationTokenSource();
        var ct = _runCts.Token;
        var url = EnvFile.LoadRaw(_envPath).GetValueOrDefault("SUPABASE_WEBHOOK_URL", "");
        if (string.IsNullOrWhiteSpace(url))
            url = EnvFile.DefaultWebhookUrl;
        _webhook = new WebhookClient(key, url, DumperVersion.Current);
        SetRunningUi(true);
        AppendLog($"Starting (dumper {DumperVersion.Current})…");

        try
        {
            var synced = await _webhook.SyncAcquiredBlueprintsAsync(ct);
            AppendLog($"Synced {synced.Count} blueprint(s) from account.");
        }
        catch (DumperUpdateRequiredException ex)
        {
            AppendLog(ex.Message);
            await StopRunAsync();
            return;
        }
        catch (OperationCanceledException)
        {
            await StopRunAsync();
            return;
        }
        catch (Exception ex)
        {
            AppendLog($"Sync failed: {ex.Message}");
            await StopRunAsync();
            return;
        }

        var full = FullHistoryCheck.IsChecked == true;
        var recent = ImportRecentCheck.IsChecked == true;
        if (full || recent)
        {
            try
            {
                await LogImportService.ImportAsync(folder, _webhook, full, AppendLog, ct);
                var after = ReadUi();
                after.FullHistoryImport = false;
                after.ImportOldLogs = false;
                FullHistoryCheck.IsChecked = false;
                ImportRecentCheck.IsChecked = false;
                EnvFile.Save(_envPath, after);
                AppendLog("Import flags cleared in .env (same as the other dumpers).");
            }
            catch (DumperUpdateRequiredException ex)
            {
                AppendLog(ex.Message);
                await StopRunAsync();
                return;
            }
            catch (OperationCanceledException)
            {
                await StopRunAsync();
                return;
            }
            catch (Exception ex)
            {
                AppendLog($"Import failed: {ex.Message}");
            }
        }

        if (WatchCheck.IsChecked != true)
        {
            AppendLog("Watch mode is off. Idle.");
            await StopRunAsync();
            return;
        }

        _watcher = new LogWatcherService(folder, _webhook, AppendLog);
        _watcher.Start();
    }

    private async Task StopRunAsync()
    {
        _runCts?.Cancel();
        if (_watcher is not null)
        {
            await _watcher.DisposeAsync();
            _watcher = null;
        }

        _webhook?.Dispose();
        _webhook = null;
        _runCts?.Dispose();
        _runCts = null;
        SetRunningUi(false);
    }

    private void AppendLog(string line)
    {
        var stamp = DateTime.Now.ToString("HH:mm:ss");
        var text = $"[{stamp}] {line}";
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.Invoke(() => AppendLog(line));
            return;
        }

        if (string.IsNullOrEmpty(OutputBox.Text))
            OutputBox.Text = text;
        else
            OutputBox.AppendText(Environment.NewLine + text);

        var lines = OutputBox.Text.Split('\n');
        if (lines.Length > 400)
            OutputBox.Text = string.Join('\n', lines[^400..]);
        OutputBox.CaretIndex = OutputBox.Text.Length;
        OutputBox.ScrollToEnd();
    }
}
