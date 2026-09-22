using Windows.Storage;

namespace BpDumperGui.Services;

internal static class LogImportService
{
    public static async Task ImportAsync(
        StorageFolder folder,
        WebhookClient webhook,
        bool fullHistory,
        Action<string> log,
        CancellationToken ct)
    {
        var files = new List<StorageFile>();
        files.AddRange(await folder.GetFilesAsync());
        try
        {
            var backups = await folder.GetFolderAsync("logbackups");
            files.AddRange(await backups.GetFilesAsync());
        }
        catch
        {
            // no logbackups folder
        }

        var logs = files
            .Where(f => f.FileType.Equals(".log", StringComparison.OrdinalIgnoreCase) ||
                        f.Name.Equals("Game.log", StringComparison.OrdinalIgnoreCase))
            .DistinctBy(f => f.Path, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var label = fullHistory ? "Full history" : $"Recent backups ({DumperVersion.MinGameVersion}.x)";
        log($"{label}: {logs.Count} log file(s) under the granted folder.");

        var posted = 0;
        var skipped = 0;
        foreach (var file in logs)
        {
            ct.ThrowIfCancellationRequested();
            string text;
            try
            {
                text = await FileIO.ReadTextAsync(file);
            }
            catch (Exception ex)
            {
                log($"  skip {file.Name}: {ex.Message}");
                continue;
            }

            if (!fullHistory && !LogParser.IsLogVersionAllowed(text, DumperVersion.MinGameVersion))
            {
                skipped++;
                continue;
            }

            foreach (var raw in text.Split('\n'))
            {
                ct.ThrowIfCancellationRequested();
                var name = LogParser.MatchBlueprint(raw.TrimEnd('\r'));
                if (name is null)
                    continue;
                try
                {
                    await webhook.PostBlueprintAsync(name, ct: ct);
                    posted++;
                    log($"  posted {name}");
                }
                catch (DumperUpdateRequiredException)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    log($"  post failed {name}: {ex.Message}");
                }
            }
        }

        log($"{label} done. Posted {posted} blueprint event(s); skipped {skipped} older log(s).");
    }
}
