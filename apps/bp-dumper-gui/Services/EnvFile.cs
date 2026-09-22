namespace BpDumperGui.Services;

internal sealed class EnvSettings
{
    public string LogPath { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public string WebhookUrl { get; set; } = "";
    public bool WatchMode { get; set; } = true;
    public bool ImportOldLogs { get; set; }
    public bool FullHistoryImport { get; set; }

    public static bool Truthy(string? raw, bool defaultTrue)
    {
        var v = (raw ?? "").Trim().ToLowerInvariant();
        if (v.Length == 0)
            return defaultTrue;
        return v is not ("0" or "false" or "n" or "no" or "off");
    }
}

internal static class EnvFile
{
    public const string DefaultWebhookUrl =
        "https://dcyugmcvlmhlfmillzma.supabase.co/functions/v1/log-watcher-webhook";

    private static readonly string[] OrderedKeys =
    [
        "LOG_PATH",
        "SUPABASE_WEBHOOK_URL",
        "LOG_WATCHER_API_KEY",
        "IMPORT_OLD_LOGS",
        "FULL_HISTORY_IMPORT",
        "WATCH_MODE",
    ];

    public static Dictionary<string, string> LoadRaw(string path)
    {
        var outMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!File.Exists(path))
            return outMap;

        foreach (var raw in File.ReadAllLines(path))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#'))
                continue;
            var eq = line.IndexOf('=');
            if (eq <= 0)
                continue;
            var k = line[..eq].Trim();
            var v = line[(eq + 1)..].Trim().Trim('"', '\'');
            outMap[k] = v;
        }

        return outMap;
    }

    public static EnvSettings Load(string path)
    {
        var raw = LoadRaw(path);
        return new EnvSettings
        {
            LogPath = raw.GetValueOrDefault("LOG_PATH") ?? "",
            ApiKey = raw.GetValueOrDefault("LOG_WATCHER_API_KEY") ?? "",
            WebhookUrl = raw.GetValueOrDefault("SUPABASE_WEBHOOK_URL") ?? "",
            WatchMode = EnvSettings.Truthy(raw.GetValueOrDefault("WATCH_MODE"), true),
            ImportOldLogs = EnvSettings.Truthy(raw.GetValueOrDefault("IMPORT_OLD_LOGS"), false),
            FullHistoryImport = EnvSettings.Truthy(raw.GetValueOrDefault("FULL_HISTORY_IMPORT"), false),
        };
    }

    public static void Save(string path, EnvSettings settings)
    {
        var existing = File.Exists(path) ? LoadRaw(path) : new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        existing["LOG_PATH"] = settings.LogPath.Trim();
        existing["LOG_WATCHER_API_KEY"] = settings.ApiKey.Trim();
        existing["WATCH_MODE"] = settings.WatchMode ? "true" : "false";
        existing["IMPORT_OLD_LOGS"] = settings.ImportOldLogs ? "true" : "false";
        existing["FULL_HISTORY_IMPORT"] = settings.FullHistoryImport ? "true" : "false";
        var url = settings.WebhookUrl.Trim();
        if (url.Length == 0)
            url = DefaultWebhookUrl;
        existing["SUPABASE_WEBHOOK_URL"] = url;

        var lines = new List<string> { "# Saved Configuration Settings" };
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var k in OrderedKeys)
        {
            if (!existing.TryGetValue(k, out var v))
                continue;
            v = v.Trim().Trim('"', '\'');
            if (v.Length == 0)
                continue;
            lines.Add(k + "=" + v);
            seen.Add(k);
        }

        foreach (var (k, v) in existing)
        {
            if (seen.Contains(k))
                continue;
            var trimmed = v.Trim().Trim('"', '\'');
            if (trimmed.Length == 0)
                continue;
            lines.Add(k + "=" + trimmed);
        }

        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);
        File.WriteAllLines(path, lines);
    }
}
