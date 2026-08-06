using BpDumperStore.Services;
using Microsoft.UI.Xaml;
using Windows.ApplicationModel;

namespace BpDumperStore;

public sealed partial class MainWindow : Window
{
    private readonly FolderAccessService _folders;
    private WebhookClient? _webhook;
    private LogWatcherService? _watcher;

    public MainWindow()
    {
        InitializeComponent();
        _folders = new FolderAccessService(this);
        ApiKeyBox.Password = AppSettings.ApiKey ?? "";
        _ = RefreshFolderLabelAsync();
        AppendLog($"Store client v{GetVersion()} — AppContainer (no runFullTrust).");
    }

    private static string GetVersion()
    {
        try
        {
            var v = Package.Current.Id.Version;
            return $"{v.Major}.{v.Minor}.{v.Build}";
        }
        catch
        {
            return "0.0.0-dev";
        }
    }

    private async Task RefreshFolderLabelAsync()
    {
        var folder = await _folders.GetGrantedFolderAsync();
        FolderPathText.Text = folder is null
            ? "No folder granted yet. Choose your Star Citizen LIVE (or channel) folder."
            : folder.Path;
    }

    private void AppendLog(string line)
    {
        DispatcherQueue.TryEnqueue(() =>
        {
            var next = string.IsNullOrEmpty(LogText.Text)
                ? line
                : LogText.Text + "\n" + line;
            // keep last ~200 lines
            var parts = next.Split('\n');
            if (parts.Length > 200)
                next = string.Join('\n', parts[^200..]);
            LogText.Text = next;
        });
    }

    private async void PickFolderButton_Click(object sender, RoutedEventArgs e)
    {
        var folder = await _folders.PickStarCitizenFolderAsync();
        if (folder is null)
        {
            AppendLog("Folder pick cancelled.");
            return;
        }

        FolderPathText.Text = folder.Path;
        AppendLog($"Granted folder: {folder.Path}");
    }

    private void ClearFolderButton_Click(object sender, RoutedEventArgs e)
    {
        _folders.ClearGrantedFolder();
        FolderPathText.Text = "No folder granted yet.";
        AppendLog("Cleared folder grant.");
    }

    private async void StartButton_Click(object sender, RoutedEventArgs e)
    {
        var key = ApiKeyBox.Password?.Trim() ?? "";
        if (string.IsNullOrEmpty(key) || !key.StartsWith("dr_", StringComparison.Ordinal))
        {
            AppendLog("Paste a valid API key (dr_…) from the site first.");
            return;
        }

        var folder = await _folders.GetGrantedFolderAsync();
        if (folder is null)
        {
            AppendLog("Choose your LIVE folder before starting.");
            return;
        }

        AppSettings.ApiKey = key;
        await StopWatcherAsync();

        _webhook = new WebhookClient(key, AppSettings.WebhookUrl, GetVersion());
        try
        {
            var synced = await _webhook.SyncAcquiredBlueprintsAsync();
            AppendLog($"Synced {synced.Count} blueprint(s) from account.");
        }
        catch (DumperUpdateRequiredException ex)
        {
            AppendLog(ex.Message);
            return;
        }
        catch (Exception ex)
        {
            AppendLog($"Sync warning: {ex.Message}");
        }

        _watcher = new LogWatcherService(folder, _webhook, AppendLog);
        _watcher.Start();
        StartButton.IsEnabled = false;
        StopButton.IsEnabled = true;
        AppendLog("Watcher started.");
    }

    private async void StopButton_Click(object sender, RoutedEventArgs e)
    {
        await StopWatcherAsync();
        AppendLog("Watcher stopped.");
    }

    private async Task StopWatcherAsync()
    {
        if (_watcher is not null)
        {
            await _watcher.DisposeAsync();
            _watcher = null;
        }

        _webhook?.Dispose();
        _webhook = null;
        StartButton.IsEnabled = true;
        StopButton.IsEnabled = false;
    }
}
