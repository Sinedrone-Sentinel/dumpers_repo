using System.Text;
using System.Text.RegularExpressions;
using Windows.Storage;
using Windows.Storage.Streams;

namespace BpDumperStore.Services;

/// <summary>
/// Minimal Game.log tailer under a user-granted StorageFolder (no drive scan).
/// Full mission/session parity with Python continues under dual-client sync rule.
/// </summary>
public sealed class LogWatcherService : IAsyncDisposable
{
    private static readonly Regex BlueprintAward = new(
        @"Awarded blueprint:\s*(.+)$",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private readonly StorageFolder _folder;
    private readonly WebhookClient _webhook;
    private readonly Action<string> _log;
    private CancellationTokenSource? _cts;
    private Task? _loop;

    public LogWatcherService(StorageFolder folder, WebhookClient webhook, Action<string> log)
    {
        _folder = folder;
        _webhook = webhook;
        _log = log;
    }

    public void Start()
    {
        if (_loop is not null)
            return;
        _cts = new CancellationTokenSource();
        _loop = Task.Run(() => RunAsync(_cts.Token));
    }

    public async Task StopAsync()
    {
        if (_cts is null)
            return;
        _cts.Cancel();
        try
        {
            if (_loop is not null)
                await _loop.ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // expected
        }

        _loop = null;
        _cts.Dispose();
        _cts = null;
    }

    private async Task RunAsync(CancellationToken ct)
    {
        _log("Watching Game.log under granted folder (no drive scan)…");
        try
        {
            await _webhook.PostEventAsync("session_start", ct: ct).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _log($"session_start failed: {ex.Message}");
        }

        ulong lastSize = 0;
        var buffer = new StringBuilder();

        while (!ct.IsCancellationRequested)
        {
            try
            {
                StorageFile? file;
                try
                {
                    file = await _folder.GetFileAsync("Game.log");
                }
                catch
                {
                    _log("Game.log not found yet — waiting…");
                    await Task.Delay(1000, ct).ConfigureAwait(false);
                    continue;
                }

                var props = await file.GetBasicPropertiesAsync();
                if (props.Size < lastSize)
                {
                    // rotation
                    lastSize = 0;
                    buffer.Clear();
                    _log("Log rotation detected.");
                }

                if (props.Size == lastSize)
                {
                    await Task.Delay(500, ct).ConfigureAwait(false);
                    continue;
                }

                using var stream = await file.OpenReadAsync();
                stream.Seek(lastSize);
                lastSize = props.Size;
                using var reader = new DataReader(stream);
                var toRead = (uint)(stream.Size - stream.Position);
                if (toRead == 0)
                    continue;
                await reader.LoadAsync(toRead);
                var chunk = reader.ReadString(toRead);
                buffer.Append(chunk);
                var text = buffer.ToString();
                var lines = text.Split('\n');
                buffer.Clear();
                if (!text.EndsWith('\n') && lines.Length > 0)
                {
                    buffer.Append(lines[^1]);
                    lines = lines[..^1];
                }

                foreach (var raw in lines)
                {
                    var line = raw.TrimEnd('\r');
                    var m = BlueprintAward.Match(line);
                    if (!m.Success)
                        continue;
                    var name = m.Groups[1].Value.Trim();
                    if (name.Length == 0)
                        continue;
                    try
                    {
                        await _webhook.PostBlueprintAsync(name, ct: ct).ConfigureAwait(false);
                        _log($"Posted blueprint: {name}");
                    }
                    catch (DumperUpdateRequiredException)
                    {
                        throw;
                    }
                    catch (Exception ex)
                    {
                        _log($"Blueprint post failed: {ex.Message}");
                    }
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (DumperUpdateRequiredException ex)
            {
                _log(ex.Message);
                break;
            }
            catch (Exception ex)
            {
                _log($"Watch error: {ex.Message}");
                await Task.Delay(1000, ct).ConfigureAwait(false);
            }
        }
    }

    public async ValueTask DisposeAsync() => await StopAsync();
}
