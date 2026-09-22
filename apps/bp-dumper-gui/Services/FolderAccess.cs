using System.Windows;
using Microsoft.Win32;
using Windows.Storage;
using Windows.Storage.AccessCache;

namespace BpDumperGui.Services;

/// <summary>User-picked LIVE folder only. Never scans drives.</summary>
internal sealed class FolderAccess
{
    public const string AccessToken = "BpDumperGui.LiveFolder";

    private readonly Window _window;

    public FolderAccess(Window window)
    {
        _window = window;
    }

    public async Task<StorageFolder?> PickLiveFolderAsync(string? startPath = null)
    {
        var dlg = new OpenFolderDialog
        {
            Title = "Select Star Citizen LIVE folder (the folder that contains Game.log)",
            Multiselect = false,
        };
        if (!string.IsNullOrWhiteSpace(startPath) && Directory.Exists(startPath))
            dlg.InitialDirectory = startPath;

        if (dlg.ShowDialog(_window) != true || string.IsNullOrWhiteSpace(dlg.FolderName))
            return null;

        var folder = await StorageFolder.GetFolderFromPathAsync(dlg.FolderName);
        try
        {
            StorageApplicationPermissions.FutureAccessList.AddOrReplace(AccessToken, folder);
        }
        catch
        {
            // Unpackaged FutureAccessList can fail; LOG_PATH still saved by the caller.
        }

        return folder;
    }

    public async Task<StorageFolder?> ResolveFolderAsync(string? logPath)
    {
        try
        {
            if (StorageApplicationPermissions.FutureAccessList.ContainsItem(AccessToken))
                return await StorageApplicationPermissions.FutureAccessList.GetFolderAsync(AccessToken);
        }
        catch
        {
            // fall through to path
        }

        if (string.IsNullOrWhiteSpace(logPath))
            return null;

        var path = logPath.Trim().Trim('"', '\'');
        if (File.Exists(path) && path.EndsWith(".log", StringComparison.OrdinalIgnoreCase))
            path = Path.GetDirectoryName(path) ?? path;

        try
        {
            return await StorageFolder.GetFolderFromPathAsync(path);
        }
        catch
        {
            return null;
        }
    }
}
