using System.Text.RegularExpressions;

namespace BpDumperGui.Services;

internal static partial class LogParser
{
    [GeneratedRegex(@"Added notification ""Received Blueprint: ([^:]+):", RegexOptions.CultureInvariant)]
    private static partial Regex BlueprintPattern();

    [GeneratedRegex(@"([0-9]+)\.([0-9]+)", RegexOptions.CultureInvariant)]
    private static partial Regex ProductVersionPattern();

    public static string? MatchBlueprint(string line)
    {
        var m = BlueprintPattern().Match(line);
        if (!m.Success)
            return null;
        var name = m.Groups[1].Value.Trim();
        return name.Length == 0 ? null : name;
    }

    public static bool IsLogVersionAllowed(string text, string minVersion)
    {
        if (string.IsNullOrWhiteSpace(minVersion))
            return true;
        var min = ProductVersionPattern().Match(minVersion);
        if (!min.Success)
            return true;
        var minMajor = int.Parse(min.Groups[1].Value);
        var minMinor = int.Parse(min.Groups[2].Value);

        using var reader = new StringReader(text);
        for (var i = 0; i <= 150; i++)
        {
            var line = reader.ReadLine();
            if (line is null)
                break;
            var lower = line.ToLowerInvariant();
            var idx = lower.IndexOf("product version:", StringComparison.Ordinal);
            var offset = 16;
            if (idx < 0)
            {
                idx = lower.IndexOf("branch:", StringComparison.Ordinal);
                offset = 7;
            }

            if (idx < 0)
                continue;
            var m = ProductVersionPattern().Match(line[(idx + offset)..]);
            if (!m.Success)
                continue;
            var maj = int.Parse(m.Groups[1].Value);
            var minor = int.Parse(m.Groups[2].Value);
            return maj > minMajor || (maj == minMajor && minor >= minMinor);
        }

        return true;
    }
}
