using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace BpDumperStore.Services;

/// <summary>HTTP client matching scripts/bp-dumper-shared/PROTOCOL.md.</summary>
public sealed class WebhookClient : IDisposable
{
    private readonly HttpClient _http;
    private readonly string _version;

    private readonly Uri _endpoint;

    public WebhookClient(string apiKey, string webhookUrl, string dumperVersion)
    {
        _version = dumperVersion;
        _endpoint = new Uri(webhookUrl.Trim());
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        _http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        _http.DefaultRequestHeaders.TryAddWithoutValidation("X-Dumper-Version", dumperVersion);
    }

    public string DumperVersion => _version;

    public async Task PostEventAsync(string type, Dictionary<string, object?>? fields = null, CancellationToken ct = default)
    {
        var payload = new Dictionary<string, object?> { ["type"] = type };
        if (fields is not null)
        {
            foreach (var (k, v) in fields)
            {
                if (v is not null)
                    payload[k] = v;
            }
        }

        using var res = await _http.PostAsJsonAsync(_endpoint, payload, ct);
        await EnsureNotUpdateRequiredAsync(res, ct);
        if ((int)res.StatusCode >= 400)
            throw new InvalidOperationException($"Webhook HTTP {(int)res.StatusCode}");
    }

    public async Task PostBlueprintAsync(string blueprint, string? contractDefinitionId = null, CancellationToken ct = default)
    {
        var fields = new Dictionary<string, object?> { ["blueprint"] = blueprint };
        if (!string.IsNullOrWhiteSpace(contractDefinitionId))
            fields["contractDefinitionId"] = contractDefinitionId;
        await PostEventAsync("blueprint_received", fields, ct);
    }

    public async Task<IReadOnlyList<string>> SyncAcquiredBlueprintsAsync(CancellationToken ct = default)
    {
        using var res = await _http.GetAsync(_endpoint, ct);
        await EnsureNotUpdateRequiredAsync(res, ct);
        res.EnsureSuccessStatusCode();
        await using var stream = await res.Content.ReadAsStreamAsync(ct);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        if (!doc.RootElement.TryGetProperty("success", out var ok) || !ok.GetBoolean())
            return Array.Empty<string>();
        if (!doc.RootElement.TryGetProperty("blueprints", out var arr) || arr.ValueKind != JsonValueKind.Array)
            return Array.Empty<string>();
        var list = new List<string>();
        foreach (var el in arr.EnumerateArray())
        {
            if (el.ValueKind == JsonValueKind.String)
            {
                var s = el.GetString();
                if (!string.IsNullOrEmpty(s))
                    list.Add(s);
            }
        }

        return list;
    }

    private static async Task EnsureNotUpdateRequiredAsync(HttpResponseMessage res, CancellationToken ct)
    {
        if ((int)res.StatusCode != 426)
            return;
        var body = await res.Content.ReadAsStringAsync(ct);
        throw new DumperUpdateRequiredException(body);
    }

    public void Dispose() => _http.Dispose();
}

public sealed class DumperUpdateRequiredException : Exception
{
    public DumperUpdateRequiredException(string detail)
        : base("This BP Dumper build is outdated. Update from the Microsoft Store.\n" + detail)
    {
    }
}
