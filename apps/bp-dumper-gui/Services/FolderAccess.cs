using System.Windows;
using System.Windows.Interop;
using Windows.Storage;
using Windows.Storage.AccessCache;
using Windows.Storage.Pickers;
using WinRT.Interop;

namespace BpDumperGui.Services;

/// <summary>FolderPicker + FutureAccessList. Never scans drives.</summary>
internal sealed class FolderAccess
{
    public const string AccessToken = "BpDumperGui.LiveFolder";

    private readonly Window _window;

    public FolderAccess(Window window)
    {
        _window = window;
    }

    public async Task<StorageFolder?> PickLiveFolderAsync()
    {
        var picker = new FolderPicker();
        picker.SuggestedStartLocation = PickerLocationId.ComputerFolder;
        picker.FileTypeFilter.Add("*");
        picker.CommitButtonText = "Use this folder";

        var hwnd = new WindowInteropHelper(_window).EnsureHandle();
        InitializeWithWindow.Initialize(picker, hwnd);

        var folder = await picker.PickSingleFolderAsync();
        if (folder is null)
            return null;

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
