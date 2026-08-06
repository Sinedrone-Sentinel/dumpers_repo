using Microsoft.UI.Xaml;
using Windows.Storage;
using Windows.Storage.AccessCache;
using Windows.Storage.Pickers;
using WinRT.Interop;

namespace BpDumperStore.Services;

/// <summary>
/// Store-only FS entry: FolderPicker + FutureAccessList.
/// Never scans drives — see scripts/bp-dumper-shared/PROTOCOL.md.
/// </summary>
public sealed class FolderAccessService
{
    private readonly Window _window;

    public FolderAccessService(Window window)
    {
        _window = window;
    }

    public async Task<StorageFolder?> GetGrantedFolderAsync()
    {
        var token = AppSettings.FolderToken;
        if (string.IsNullOrEmpty(token))
            return null;

        try
        {
            if (!StorageApplicationPermissions.FutureAccessList.ContainsItem(token))
            {
                AppSettings.FolderToken = null;
                return null;
            }

            return await StorageApplicationPermissions.FutureAccessList.GetFolderAsync(token);
        }
        catch
        {
            AppSettings.FolderToken = null;
            return null;
        }
    }

    public async Task<StorageFolder?> PickStarCitizenFolderAsync()
    {
        var picker = new FolderPicker();
        picker.SuggestedStartLocation = PickerLocationId.ComputerFolder;
        picker.FileTypeFilter.Add("*");
        picker.CommitButtonText = "Use this folder";

        var hwnd = WindowNative.GetWindowHandle(_window);
        InitializeWithWindow.Initialize(picker, hwnd);

        var folder = await picker.PickSingleFolderAsync();
        if (folder is null)
            return null;

        // Prefer persisting under a stable token key so we replace prior grants.
        var token = AppSettings.FolderToken;
        if (!string.IsNullOrEmpty(token) &&
            StorageApplicationPermissions.FutureAccessList.ContainsItem(token))
        {
            StorageApplicationPermissions.FutureAccessList.AddOrReplace(token, folder);
        }
        else
        {
            token = StorageApplicationPermissions.FutureAccessList.Add(folder);
            AppSettings.FolderToken = token;
        }

        return folder;
    }

    public void ClearGrantedFolder()
    {
        var token = AppSettings.FolderToken;
        if (!string.IsNullOrEmpty(token) &&
            StorageApplicationPermissions.FutureAccessList.ContainsItem(token))
        {
            StorageApplicationPermissions.FutureAccessList.Remove(token);
        }

        AppSettings.FolderToken = null;
    }
}
