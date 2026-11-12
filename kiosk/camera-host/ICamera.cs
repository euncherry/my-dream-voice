namespace Mdv.CameraHost;

/// <summary>
/// 카메라 백엔드 계약. FakeCamera(지금)와 EdsdkCamera(SDK 승인 후)가 같은 자리에 들어간다.
///
/// ⚠️ 모든 멤버는 CameraWorker의 단일 스레드에서만 호출된다.
///    그래서 구현체는 따로 동기화하지 않는다.
/// </summary>
public interface ICamera : IDisposable
{
    /// <summary>프로토콜로 내보내는 백엔드 이름 ("fake" | "edsdk")</summary>
    string Backend { get; }

    bool IsConnected { get; }

    CameraInfo Connect();

    void Disconnect();

    void StartLiveView();

    void StopLiveView();

    /// <summary>라이브뷰 프레임 1장(JPEG). 아직 준비되지 않았으면 null.</summary>
    byte[]? GetLiveViewFrame();

    /// <summary>촬영 후 파일이 destPath에 완전히 쓰일 때까지 블록한다.</summary>
    CapturedPhoto Capture(string destPath);

    /// <summary>워커 루프가 주기적으로 호출한다 (EDSDK의 EdsGetEvent 자리).</summary>
    void Pump();

    /// <summary>USB 분리 등으로 연결이 끊겼을 때. 인자는 개발자용 메시지.</summary>
    event Action<string>? Disconnected;
}

public sealed record CameraInfo(
    string Model,
    int PhotoWidth,
    int PhotoHeight,
    int LiveViewWidth,
    int LiveViewHeight);

public sealed record CapturedPhoto(string Path, long Bytes, int Width, int Height);

/// <summary>Code는 프로토콜 error.code로 그대로 나간다.</summary>
public sealed class CameraException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}
