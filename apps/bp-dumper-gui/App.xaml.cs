using System.Windows;
using BpDumperGui.Services;

namespace BpDumperGui;

public partial class App : Application
{
    private void OnStartup(object sender, StartupEventArgs e)
    {
        if (!SingleInstance.TryAcquire())
        {
            MessageBox.Show(
                "BP Dumper is already running.\nClose DumperApps.exe, the Python script, or the other GUI window first.",
                "BP Dumper-GUI",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            Shutdown();
            return;
        }

        var win = new MainWindow();
        win.Show();
    }

    private void OnExit(object sender, ExitEventArgs e)
    {
        SingleInstance.Release();
    }
}
