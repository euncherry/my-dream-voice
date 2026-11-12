using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace Mdv.CameraHost;

/// <summary>
/// 실물 없이 전체 경로를 검증하는 가짜 카메라.
/// 해상도·지연은 R100에 맞춰 두어 파이프라인 부하가 실물과 비슷하게 나오게 한다.
///   - 사진 6000×4000 (R100 Large, 3:2) · 셔터 지연 350ms
///   - 라이브뷰 960×640 · JPEG 스트림
/// ⚠️ 라이브뷰 크기와 셔터 지연은 가정값이다. 실기(Phase 3)에서 실측해 맞춘다.
/// 화면에 항상 FAKE CAMERA가 찍혀 실제 촬영으로 오인되지 않는다.
/// </summary>
public sealed class FakeCamera : ICamera
{
    private const int LiveWidth = 960;
    private const int LiveHeight = 640;
    private const int PhotoWidth = 6000;
    private const int PhotoHeight = 4000;
    private const int ShutterLatencyMs = 350;

    /// <summary>네컷 한 칸 비율 (525×735). 합성할 때 잘리는 범위를 눈으로 확인하는 용도</summary>
    private const float CutAspect = 5f / 7f;

    private static readonly ImageCodecInfo JpegCodec =
        ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);

    private readonly Bitmap _liveBitmap = new(LiveWidth, LiveHeight, PixelFormat.Format24bppRgb);
    private long _frame;
    private int _shots;
    private bool _live;

    public string Backend => "fake";

    public bool IsConnected { get; private set; }

    public event Action<string>? Disconnected;

    public CameraInfo Connect()
    {
        IsConnected = true;
        return new CameraInfo("Fake EOS R100", PhotoWidth, PhotoHeight, LiveWidth, LiveHeight);
    }

    public void Disconnect()
    {
        _live = false;
        IsConnected = false;
    }

    public void StartLiveView()
    {
        RequireConnected();
        _live = true;
    }

    public void StopLiveView() => _live = false;

    public byte[]? GetLiveViewFrame()
    {
        if (!_live) return null;

        _frame++;
        using (var g = Graphics.FromImage(_liveBitmap))
        {
            Paint(g, LiveWidth, LiveHeight, _frame, $"LIVE #{_frame}");
        }

        using var stream = new MemoryStream(128 * 1024);
        SaveJpeg(_liveBitmap, stream, quality: 70);
        return stream.ToArray();
    }

    public CapturedPhoto Capture(string destPath)
    {
        RequireConnected();
        Thread.Sleep(ShutterLatencyMs);

        _shots++;
        using var photo = new Bitmap(PhotoWidth, PhotoHeight, PixelFormat.Format24bppRgb);
        using (var g = Graphics.FromImage(photo))
        {
            Paint(g, PhotoWidth, PhotoHeight, _frame + _shots * 40, $"SHOT #{_shots}");
        }

        // 읽는 쪽이 쓰다 만 파일을 보지 않도록 임시 파일에 쓴 뒤 옮긴다
        var tmp = destPath + ".tmp";
        using (var file = File.Create(tmp))
        {
            SaveJpeg(photo, file, quality: 90);
        }
        File.Move(tmp, destPath, overwrite: true);

        return new CapturedPhoto(destPath, new FileInfo(destPath).Length, PhotoWidth, PhotoHeight);
    }

    public void Pump()
    {
    }

    /// <summary>USB 분리를 흉내 낸다. 실제 분리와 같은 경로로 Disconnected가 나간다.</summary>
    public void SimulateDisconnect()
    {
        Disconnect();
        Disconnected?.Invoke("fake: USB 분리 시뮬레이션");
    }

    public void Dispose() => _liveBitmap.Dispose();

    private void RequireConnected()
    {
        if (!IsConnected) throw new CameraException("not-connected", "카메라가 연결되어 있지 않습니다");
    }

    private static void Paint(Graphics g, int width, int height, long tick, string label)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var unit = height / 640f;
        var bounds = new Rectangle(0, 0, width, height);

        using (var background = new LinearGradientBrush(
            bounds, Color.FromArgb(38, 70, 120), Color.FromArgb(176, 92, 96), tick % 360))
        {
            g.FillRectangle(background, bounds);
        }

        // 움직임이 보여야 라이브뷰가 멈췄는지 알 수 있다
        var radius = 60 * unit;
        var cx = width / 2f + MathF.Sin(tick * 0.05f) * width * 0.16f;
        var cy = height / 2f + MathF.Cos(tick * 0.037f) * height * 0.28f;
        using (var ball = new SolidBrush(Color.FromArgb(235, 232, 184, 74)))
        {
            g.FillEllipse(ball, cx - radius, cy - radius, radius * 2, radius * 2);
        }

        var cutWidth = height * CutAspect;
        using (var guide = new Pen(Color.FromArgb(220, 255, 255, 255), 3 * unit))
        {
            guide.DashStyle = DashStyle.Dash;
            g.DrawRectangle(guide, (width - cutWidth) / 2, 0, cutWidth, height - 1);
        }

        using var title = new Font("Arial", 44 * unit, FontStyle.Bold, GraphicsUnit.Pixel);
        using var small = new Font("Arial", 26 * unit, FontStyle.Regular, GraphicsUnit.Pixel);
        using var white = new SolidBrush(Color.White);
        using var center = new StringFormat { Alignment = StringAlignment.Center };
        var middle = width / 2f;
        g.DrawString("FAKE CAMERA", title, white, middle, height * 0.08f, center);
        g.DrawString(label, small, white, middle, height * 0.17f, center);
        g.DrawString(DateTime.Now.ToString("HH:mm:ss.fff"), small, white, middle, height * 0.86f, center);
    }

    private static void SaveJpeg(Image image, Stream output, long quality)
    {
        using var parameters = new EncoderParameters(1);
        parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
        image.Save(output, JpegCodec, parameters);
    }
}
