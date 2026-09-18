using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        var installRoot = AppDomain.CurrentDomain.BaseDirectory;
        var runtimePath = Path.Combine(installRoot, "app", "JaeTravelToolbox.Runtime.exe");
        if (!File.Exists(runtimePath))
        {
            MessageBox.Show(
                "未找到程序运行组件。请使用完整安装包重新安装阿洁的旅行工具箱。",
                "阿洁的旅行工具箱",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 2;
        }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = runtimePath,
                Arguments = JoinArguments(args),
                WorkingDirectory = installRoot,
                UseShellExecute = false,
            });
            return 0;
        }
        catch (Exception)
        {
            MessageBox.Show(
                "程序启动失败。请确认安装目录未被移动或破坏，然后重试。",
                "阿洁的旅行工具箱",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return 3;
        }
    }

    private static string JoinArguments(string[] args)
    {
        var builder = new StringBuilder();
        for (var index = 0; index < args.Length; index += 1)
        {
            if (index > 0) builder.Append(' ');
            builder.Append(QuoteArgument(args[index] ?? string.Empty));
        }
        return builder.ToString();
    }

    private static string QuoteArgument(string value)
    {
        if (value.Length > 0 && value.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return value;
        var builder = new StringBuilder("\"");
        var slashCount = 0;
        foreach (var character in value)
        {
            if (character == '\\')
            {
                slashCount += 1;
                continue;
            }
            if (character == '"')
            {
                builder.Append('\\', slashCount * 2 + 1);
                builder.Append('"');
                slashCount = 0;
                continue;
            }
            builder.Append('\\', slashCount);
            slashCount = 0;
            builder.Append(character);
        }
        builder.Append('\\', slashCount * 2);
        builder.Append('"');
        return builder.ToString();
    }
}
