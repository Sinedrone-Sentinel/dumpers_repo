namespace BpDumperGui.Services;

internal static class AppDir
{
    public static bool IsPackaged()
    {
        if (!string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PACKAGE_FAMILY_NAME")) ||
            !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("MsixPackageFamilyName")))
        {
            return true;
        }

        var exe = Environment.ProcessPath;
        if (string.IsNullOrEmpty(exe))
            return false;
        return exe.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            .Any(p => p.Equals("WindowsApps", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Directory that holds .env. Unpackaged: beside the exe. Packaged: %LOCALAPPDATA%\BP Dumper.</summary>
    public static string Dir()
    {
        if (IsPackaged())
        {
            var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            var dir = Path.Combine(local, "BP Dumper");
            Directory.CreateDirectory(dir);
            return dir;
        }

        var exe = Environment.ProcessPath;
        if (string.IsNullOrEmpty(exe))
            return Directory.GetCurrentDirectory();
        return Path.GetDirectoryName(Path.GetFullPath(exe)) ?? Directory.GetCurrentDirectory();
    }

    public static string DefaultEnvPath() => Path.Combine(Dir(), ".env");
}
