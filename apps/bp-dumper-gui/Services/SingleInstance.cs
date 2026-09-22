using System.Runtime.InteropServices;

namespace BpDumperGui.Services;

/// <summary>Same Windows mutex as DumperApps.exe and dumper.py.</summary>
internal static class SingleInstance
{
    public const string MutexName = @"Local\DumpersRepo.BPDumper";
    private const int ErrorAlreadyExists = 183;

    private static IntPtr _handle;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateMutexW(IntPtr lpMutexAttributes, bool bInitialOwner, string lpName);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr hObject);

    public static bool TryAcquire()
    {
        _handle = CreateMutexW(IntPtr.Zero, false, MutexName);
        if (_handle == IntPtr.Zero)
            return true;
        var err = Marshal.GetLastWin32Error();
        if (err == ErrorAlreadyExists)
        {
            CloseHandle(_handle);
            _handle = IntPtr.Zero;
            return false;
        }

        return true;
    }

    public static void Release()
    {
        if (_handle == IntPtr.Zero)
            return;
        CloseHandle(_handle);
        _handle = IntPtr.Zero;
    }
}
