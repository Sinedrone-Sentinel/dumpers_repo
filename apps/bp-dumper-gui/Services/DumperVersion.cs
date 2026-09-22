using System.Text.Json;

namespace BpDumperGui.Services;

internal static class DumperVersion
{
    public static string Current { get; } = LoadVersion();
    public static string MinGameVersion { get; } = LoadMinGame();

    private static string LoadVersion()
    {
        try
        {
            var path = Path.Combine(AppContext.BaseDirectory, "Data", "bp-dumper-version.json");
            if (!File.Exists(path))
                return "1.21.0";
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            if (doc.RootElement.TryGetProperty("version", out var v))
            {
                var s = v.GetString();
                if (!string.IsNullOrWhiteSpace(s))
                    return s.Trim();
            }
        }
        catch
        {
            // keep fallback
        }

        return "1.21.0";
    }

    private static string LoadMinGame()
    {
        try
        {
            var path = Path.Combine(AppContext.BaseDirectory, "Data", "game-build-version.json");
            if (!File.Exists(path))
                return "4.10";
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            if (doc.RootElement.TryGetProperty("version", out var v))
            {
                var s = v.GetString() ?? "";
                var parts = s.Split('.', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (parts.Length >= 2 && int.TryParse(parts[0], out _) && int.TryParse(parts[1], out _))
                    return parts[0] + "." + parts[1];
            }
        }
        catch
        {
            // keep fallback
        }

        return "4.10";
    }
}
