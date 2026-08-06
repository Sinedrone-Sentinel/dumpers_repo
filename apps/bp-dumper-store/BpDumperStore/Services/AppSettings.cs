using Windows.Storage;

namespace BpDumperStore.Services;

/// <summary>Persists API key + FutureAccessList token for the granted SC folder.</summary>
public static class AppSettings
{
    public const string FolderTokenKey = "sc_log_folder_token";
    private const string ApiKeySetting = "api_key";
    private const string WebhookUrlSetting = "webhook_url";

    public static string? ApiKey
    {
        get => ApplicationData.Current.LocalSettings.Values[ApiKeySetting] as string;
        set
        {
            if (string.IsNullOrWhiteSpace(value))
                ApplicationData.Current.LocalSettings.Values.Remove(ApiKeySetting);
            else
                ApplicationData.Current.LocalSettings.Values[ApiKeySetting] = value.Trim();
        }
    }

    public static string WebhookUrl
    {
        get => ApplicationData.Current.LocalSettings.Values[WebhookUrlSetting] as string
               ?? "https://dcyugmcvlmhlfmillzma.supabase.co/functions/v1/log-watcher-webhook";
        set => ApplicationData.Current.LocalSettings.Values[WebhookUrlSetting] = value.Trim();
    }

    public static string? FolderToken
    {
        get => ApplicationData.Current.LocalSettings.Values[FolderTokenKey] as string;
        set
        {
            if (string.IsNullOrWhiteSpace(value))
                ApplicationData.Current.LocalSettings.Values.Remove(FolderTokenKey);
            else
                ApplicationData.Current.LocalSettings.Values[FolderTokenKey] = value;
        }
    }
}
