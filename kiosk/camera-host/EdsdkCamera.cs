using System.Diagnostics;
using System.Runtime.InteropServices;

namespace Mdv.CameraHost;

/// <summary>
/// Canon EOS R100 (EDSDK) 백엔드.
///
/// - SDK 수명 = 연결 수명. Connect에서 초기화하고 Disconnect·연결 끊김에서 종료한다.
///   다시 연결할 때 카메라 목록을 새로 받기 위해서다.
/// - 촬영 파일은 카드가 아니라 PC로 바로 받는다 (SaveTo=Host). 메모리로 받아 .tmp에 쓴 뒤 옮긴다.
/// - 이벤트는 CameraWorker 스레드에서 EdsGetEvent로 받는다. 콜백은 표시만 하고, 정리는 Pump에서 한다.
///   (콜백 안에서 세션을 닫거나 예외를 던지면 SDK 안에서 터진다)
///
/// ⚠️ 실기(Phase 3)에서 확인할 것: 라이브뷰 크기·fps, 셔터 지연, AF 여부, Silent Shutter 촬영 가능 여부.
/// </summary>
public sealed class EdsdkCamera : ICamera
{
    /// <summary>셔터부터 파일 저장까지. Node 쪽 제한(20초)보다 짧아야 오류 메시지가 정확히 간다</summary>
    private const int CaptureTimeoutMs = 15_000;

    /// <summary>카메라가 바쁘다고 할 때 다시 시도하는 시간</summary>
    private const int BusyRetryMs = 1_500;

    /// <summary>자동 전원 꺼짐 타이머를 미루는 간격</summary>
    private const int KeepAliveMs = 60_000;

    /// <summary>
    /// false = AF 없이 바로 셔터를 끊는다. 설치 때 초점을 고정(MF)해 둔다는 가정이다.
    /// AF를 쓰면 초점을 못 잡을 때 촬영 자체가 실패한다 (Phase 3에서 확정).
    /// </summary>
    private const bool UseAutoFocus = false;

    // 네이티브 쪽이 들고 있으므로 GC되지 않게 필드로 잡아 둔다
    private readonly Edsdk.ObjectEventHandler _onObject;
    private readonly Edsdk.StateEventHandler _onState;

    private bool _sdk;
    private IntPtr _camera;
    private bool _session;
    private CameraInfo? _info;
    private bool _live;
    private bool _liveSizeLogged;
    private long _nextKeepAlive;

    // 콜백이 세우고 Pump가 처리하는 표시
    private string? _lostReason;
    private bool _extendRequested;

    // 촬영 1건의 상태
    private string? _pendingPath;
    private CapturedPhoto? _captured;
    private CameraException? _captureError;
    private string? _skippedFile;

    public EdsdkCamera()
    {
        _onObject = OnObjectEvent;
        _onState = OnStateEvent;
    }

    public string Backend => "edsdk";

    public bool IsConnected => _session;

    public event Action<string>? Disconnected;

    public CameraInfo Connect()
    {
        if (_session && _info is not null) return _info;

        try
        {
            if (!_sdk)
            {
                Edsdk.Check(Edsdk.EdsInitializeSDK(), "SDK 초기화");
                _sdk = true;
            }

            _camera = FindCamera();

            if (Edsdk.EdsGetDeviceInfo(_camera, out var device) == Edsdk.ErrOk)
            {
                Console.Error.WriteLine($"edsdk: {device.DeviceDescription} ({device.PortName})");
            }

            Edsdk.Check(
                Edsdk.EdsSetObjectEventHandler(_camera, Edsdk.ObjectEventAll, _onObject, IntPtr.Zero),
                "파일 이벤트 등록");
            Edsdk.Check(
                Edsdk.EdsSetCameraStateEventHandler(_camera, Edsdk.StateEventAll, _onState, IntPtr.Zero),
                "상태 이벤트 등록");

            Edsdk.Check(Edsdk.EdsOpenSession(_camera), "세션 열기");
            _session = true;

            var model = ReadString(Edsdk.PropProductName)
                ?? (string.IsNullOrEmpty(device.DeviceDescription) ? "Canon EOS" : device.DeviceDescription);

            // 카드에 쓰지 않고 PC로 바로 받는다. 용량을 알려 주지 않으면 카메라가 '공간 없음'으로 본다
            SetUInt(Edsdk.PropSaveTo, Edsdk.SaveToHost, "저장 위치(PC)");
            Edsdk.Check(
                Edsdk.EdsSetCapacity(_camera, new Edsdk.Capacity
                {
                    NumberOfFreeClusters = 0x7FFFFFFF,
                    BytesPerSector = 0x1000,
                    Reset = 1,
                }),
                "PC 저장 용량");

            _lostReason = null;
            _extendRequested = false;
            _nextKeepAlive = Stopwatch.GetTimestamp() + MsToTicks(KeepAliveMs);

            // 크기는 실물에서 읽는다: 사진은 촬영 결과로, 라이브뷰는 첫 프레임 로그로 확인한다
            _info = new CameraInfo(model, 0, 0, 0, 0);
            Console.Error.WriteLine($"edsdk: 연결됨 — {model}");
            return _info;
        }
        catch (DllNotFoundException e)
        {
            Close();
            throw new CameraException("sdk-missing", $"EDSDK.dll을 불러오지 못했습니다: {e.Message}");
        }
        catch
        {
            Close();
            throw;
        }
    }

    public void Disconnect()
    {
        if (_live) StopLiveView();
        Close();
    }

    public void StartLiveView()
    {
        RequireConnected();

        // 기종에 따라 Evf_Mode를 먼저 켜야 한다. 지원하지 않는 기종이면 오류를 무시한다
        var mode = 1u;
        Edsdk.EdsSetPropertyData(_camera, Edsdk.PropEvfMode, 0, sizeof(uint), ref mode);

        // PC로만 내보내면 카메라 뒷면 화면은 꺼진다 (키오스크에서는 그쪽이 맞다)
        var output = Edsdk.EvfOutputPc;
        RetryWhileBusy(
            () => Edsdk.EdsSetPropertyData(_camera, Edsdk.PropEvfOutputDevice, 0, sizeof(uint), ref output),
            "라이브뷰 시작");

        _live = true;
        _liveSizeLogged = false;
    }

    public void StopLiveView()
    {
        if (!_live) return;
        _live = false;
        if (!_session) return;

        var output = Edsdk.EvfOutputTft;
        var err = Edsdk.EdsSetPropertyData(_camera, Edsdk.PropEvfOutputDevice, 0, sizeof(uint), ref output);
        if (err != Edsdk.ErrOk) Console.Error.WriteLine($"edsdk: 라이브뷰 정지 0x{err:X8}");
    }

    public byte[]? GetLiveViewFrame()
    {
        if (!_live || !_session) return null;

        var stream = IntPtr.Zero;
        var image = IntPtr.Zero;
        try
        {
            Edsdk.Check(Edsdk.EdsCreateMemoryStream(0, out stream), "라이브뷰 버퍼");
            Edsdk.Check(Edsdk.EdsCreateEvfImageRef(stream, out image), "라이브뷰 이미지");

            var err = Edsdk.EdsDownloadEvfImage(_camera, image);

            // 켠 직후와 촬영 직후에는 잠깐 프레임이 없다 — 정상
            if (err is Edsdk.ErrObjectNotReady or Edsdk.ErrDeviceBusy) return null;
            if (Edsdk.IsCommLoss(err))
            {
                _lostReason ??= $"라이브뷰 중 연결이 끊겼습니다 (EDSDK 0x{err:X8})";
                return null;
            }
            Edsdk.Check(err, "라이브뷰 프레임");

            var jpeg = Edsdk.CopyStream(stream);
            if (!_liveSizeLogged && Jpeg.Size(jpeg) is { } size)
            {
                _liveSizeLogged = true;
                Console.Error.WriteLine($"edsdk: 라이브뷰 {size.Width}×{size.Height}, {jpeg.Length / 1024}KB/프레임");
            }
            return jpeg;
        }
        finally
        {
            if (image != IntPtr.Zero) Edsdk.EdsRelease(image);
            if (stream != IntPtr.Zero) Edsdk.EdsRelease(stream);
        }
    }

    public CapturedPhoto Capture(string destPath)
    {
        RequireConnected();

        _pendingPath = destPath;
        _captured = null;
        _captureError = null;
        _skippedFile = null;
        try
        {
            PressShutter();

            var deadline = Stopwatch.GetTimestamp() + MsToTicks(CaptureTimeoutMs);
            while (_captured is null && _captureError is null)
            {
                if (_lostReason is not null)
                {
                    var reason = _lostReason;
                    HandleLoss();
                    throw new CameraException("not-connected", reason);
                }
                if (Stopwatch.GetTimestamp() > deadline)
                {
                    throw new CameraException("capture-timeout", _skippedFile is null
                        ? "촬영 파일이 오지 않았습니다"
                        : $"JPEG가 오지 않았습니다 ({_skippedFile}만 받음). 카메라 화질을 JPEG로 설정하세요");
                }
                PumpEvents();
                Thread.Sleep(5);
            }

            return _captured ?? throw _captureError!;
        }
        finally
        {
            _pendingPath = null;
        }
    }

    public void Pump()
    {
        if (!_sdk) return;

        PumpEvents();

        if (_lostReason is not null)
        {
            HandleLoss();
            return;
        }

        if (!_session) return;

        var now = Stopwatch.GetTimestamp();
        if (_extendRequested || now >= _nextKeepAlive)
        {
            _extendRequested = false;
            _nextKeepAlive = now + MsToTicks(KeepAliveMs);
            var err = Edsdk.EdsSendCommand(_camera, Edsdk.CmdExtendShutDownTimer, 0);
            if (err is not (Edsdk.ErrOk or Edsdk.ErrDeviceBusy))
            {
                Console.Error.WriteLine($"edsdk: 전원 타이머 연장 실패 0x{err:X8}");
            }
        }
    }

    public void Dispose()
    {
        // 보통은 Program이 워커 스레드에서 Disconnect를 먼저 부른다. 여기는 그게 실패했을 때의 안전망이다
        try
        {
            Disconnect();
        }
        catch (Exception e)
        {
            Console.Error.WriteLine($"edsdk: 정리 중 오류 {e.Message}");
        }
    }

    // ── 연결 ─────────────────────────────────────────────────

    private static IntPtr FindCamera()
    {
        Edsdk.Check(Edsdk.EdsGetCameraList(out var list), "카메라 목록");
        try
        {
            Edsdk.Check(Edsdk.EdsGetChildCount(list, out var count), "카메라 수");
            if (count == 0)
            {
                throw new CameraException(
                    "not-found",
                    "카메라를 찾지 못했습니다. USB 케이블·카메라 전원을 확인하고 EOS Utility를 종료하세요");
            }
            if (count > 1) Console.Error.WriteLine($"edsdk: 카메라 {count}대 연결됨 — 첫 번째만 씁니다");

            Edsdk.Check(Edsdk.EdsGetChildAtIndex(list, 0, out var camera), "카메라 선택");
            return camera;
        }
        finally
        {
            Edsdk.EdsRelease(list);
        }
    }

    /// <summary>세션·카메라 참조·SDK를 모두 정리한다. 오류는 무시한다 (끊긴 카메라에는 실패하는 게 정상).</summary>
    private void Close(bool closeSession = true)
    {
        _live = false;
        _info = null;

        if (_camera != IntPtr.Zero)
        {
            // 정리 도중 콜백이 들어오지 않게 핸들러를 먼저 뗀다
            Edsdk.EdsSetObjectEventHandler(_camera, Edsdk.ObjectEventAll, null, IntPtr.Zero);
            Edsdk.EdsSetCameraStateEventHandler(_camera, Edsdk.StateEventAll, null, IntPtr.Zero);
            if (_session && closeSession) Edsdk.EdsCloseSession(_camera);
            Edsdk.EdsRelease(_camera);
            _camera = IntPtr.Zero;
        }
        _session = false;

        if (_sdk)
        {
            Edsdk.EdsTerminateSDK();
            _sdk = false;
        }
    }

    private void HandleLoss()
    {
        var reason = _lostReason ?? "카메라 연결이 끊겼습니다";
        _lostReason = null;
        Console.Error.WriteLine($"edsdk: {reason}");
        Close(closeSession: false);
        Disconnected?.Invoke(reason);
    }

    private void RequireConnected()
    {
        if (!_session) throw new CameraException("not-connected", "카메라가 연결되어 있지 않습니다");
    }

    // ── 촬영 ─────────────────────────────────────────────────

    private void PressShutter()
    {
        var press = UseAutoFocus ? Edsdk.ShutterCompletely : Edsdk.ShutterCompletelyNonAf;
        try
        {
            RetryWhileBusy(() => Edsdk.EdsSendCommand(_camera, Edsdk.CmdPressShutterButton, press), "셔터");
        }
        finally
        {
            // 셔터를 누른 채로 두면 연속 촬영이 되거나 다음 명령이 막힌다 — 실패해도 반드시 뗀다
            try
            {
                RetryWhileBusy(
                    () => Edsdk.EdsSendCommand(_camera, Edsdk.CmdPressShutterButton, Edsdk.ShutterOff),
                    "셔터 놓기");
            }
            catch (CameraException e)
            {
                Console.Error.WriteLine($"edsdk: {e.Message}");
            }
        }
    }

    /// <summary>카메라가 촬영 파일을 보내겠다고 할 때 (콜백 — 예외를 밖으로 던지지 않는다)</summary>
    private uint OnObjectEvent(uint inEvent, IntPtr inRef, IntPtr inContext)
    {
        try
        {
            if (inEvent == Edsdk.ObjectEventDirItemRequestTransfer) Transfer(inRef);
        }
        catch (CameraException e)
        {
            _captureError ??= e;
        }
        catch (Exception e)
        {
            _captureError ??= new CameraException("capture-failed", $"사진 저장 실패: {e.Message}");
        }
        finally
        {
            // 핸들러로 넘어온 참조는 핸들러가 해제한다
            if (inRef != IntPtr.Zero) Edsdk.EdsRelease(inRef);
        }
        return Edsdk.ErrOk;
    }

    private void Transfer(IntPtr item)
    {
        Edsdk.Check(Edsdk.EdsGetDirectoryItemInfo(item, out var file), "파일 정보");

        var path = _pendingPath;
        if (path is null)
        {
            // 카메라 버튼을 직접 눌렀을 때 — 받지 않고 버린다
            Edsdk.EdsDownloadCancel(item);
            Console.Error.WriteLine($"edsdk: 요청하지 않은 촬영 파일을 버립니다 ({file.FileName})");
            return;
        }
        if (!file.FileName.EndsWith(".JPG", StringComparison.OrdinalIgnoreCase))
        {
            // RAW+JPEG 설정이면 RAW는 버리고 JPEG를 기다린다
            Edsdk.EdsDownloadCancel(item);
            _skippedFile = file.FileName;
            return;
        }

        var stream = IntPtr.Zero;
        byte[] jpeg;
        try
        {
            Edsdk.Check(Edsdk.EdsCreateMemoryStream(file.Size, out stream), "다운로드 버퍼");
            try
            {
                Edsdk.Check(Edsdk.EdsDownload(item, file.Size, stream), "사진 다운로드");
            }
            catch
            {
                Edsdk.EdsDownloadCancel(item);
                throw;
            }
            Edsdk.Check(Edsdk.EdsDownloadComplete(item), "다운로드 완료");
            jpeg = Edsdk.CopyStream(stream);
        }
        finally
        {
            if (stream != IntPtr.Zero) Edsdk.EdsRelease(stream);
        }

        var (width, height) = Jpeg.Size(jpeg)
            ?? throw new CameraException("capture-failed", $"받은 파일이 JPEG가 아닙니다 ({file.FileName})");

        // 읽는 쪽이 쓰다 만 파일을 보지 않도록 임시 파일에 쓴 뒤 옮긴다
        var tmp = path + ".tmp";
        File.WriteAllBytes(tmp, jpeg);
        File.Move(tmp, path, overwrite: true);

        _captured = new CapturedPhoto(path, jpeg.Length, width, height);
    }

    /// <summary>카메라 상태 알림 (콜백 — 표시만 한다)</summary>
    private uint OnStateEvent(uint inEvent, uint inEventData, IntPtr inContext)
    {
        switch (inEvent)
        {
            case Edsdk.StateEventShutdown:
                _lostReason ??= "카메라 연결이 끊겼습니다 (전원 꺼짐 또는 USB 분리)";
                break;
            case Edsdk.StateEventWillSoonShutDown:
                _extendRequested = true;
                break;
            case Edsdk.StateEventCaptureError when _pendingPath is not null:
                _captureError ??= new CameraException(
                    "capture-failed", $"카메라가 촬영 오류를 알렸습니다 (0x{inEventData:X})");
                break;
            case Edsdk.StateEventCaptureError:
            case Edsdk.StateEventInternalError:
                Console.Error.WriteLine($"edsdk: 상태 이벤트 0x{inEvent:X} (0x{inEventData:X})");
                break;
        }
        return Edsdk.ErrOk;
    }

    // ── 공용 ─────────────────────────────────────────────────

    private void RetryWhileBusy(Func<uint> call, string what)
    {
        var deadline = Stopwatch.GetTimestamp() + MsToTicks(BusyRetryMs);
        while (true)
        {
            var err = call();
            if (err == Edsdk.ErrOk) return;
            if (err != Edsdk.ErrDeviceBusy || Stopwatch.GetTimestamp() > deadline)
            {
                if (Edsdk.IsCommLoss(err)) _lostReason ??= $"{what} 중 연결이 끊겼습니다 (EDSDK 0x{err:X8})";
                throw Edsdk.ToException(err, what);
            }
            PumpEvents();
            Thread.Sleep(20);
        }
    }

    private void SetUInt(uint property, uint value, string what) =>
        RetryWhileBusy(() => Edsdk.EdsSetPropertyData(_camera, property, 0, sizeof(uint), ref value), what);

    private string? ReadString(uint property)
    {
        if (Edsdk.EdsGetPropertySize(_camera, property, 0, out _, out var size) != Edsdk.ErrOk || size == 0)
        {
            return null;
        }
        var buffer = Marshal.AllocHGlobal((int)size);
        try
        {
            return Edsdk.EdsGetPropertyData(_camera, property, 0, size, buffer) == Edsdk.ErrOk
                ? Marshal.PtrToStringAnsi(buffer)
                : null;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    /// <summary>
    /// 카메라 이벤트를 꺼낸다. 콘솔 앱이라 SDK가 쓰는 창 메시지도 직접 돌려 준다.
    /// </summary>
    private void PumpEvents()
    {
        if (!_sdk) return;
        Edsdk.EdsGetEvent();
        while (PeekMessage(out var msg, IntPtr.Zero, 0, 0, PmRemove))
        {
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }
    }

    private static long MsToTicks(int ms) => ms * Stopwatch.Frequency / 1000;

    private const uint PmRemove = 0x0001;

    [StructLayout(LayoutKind.Sequential)]
    private struct Msg
    {
        public IntPtr Hwnd;
        public uint Message;
        public IntPtr WParam;
        public IntPtr LParam;
        public uint Time;
        public int PtX;
        public int PtY;
        public uint Private;
    }

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool PeekMessage(out Msg lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax, uint wRemoveMsg);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool TranslateMessage(ref Msg lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref Msg lpMsg);
}

/// <summary>JPEG 헤더에서 크기만 읽는다 (전체 디코딩 없이).</summary>
internal static class Jpeg
{
    public static (int Width, int Height)? Size(ReadOnlySpan<byte> b)
    {
        if (b.Length < 4 || b[0] != 0xFF || b[1] != 0xD8) return null;

        var i = 2;
        while (i + 8 < b.Length)
        {
            if (b[i] != 0xFF) return null;
            var marker = b[i + 1];
            if (marker == 0xFF)
            {
                i++; // 채움 바이트
                continue;
            }
            if (marker is 0x01 or (>= 0xD0 and <= 0xD8))
            {
                i += 2; // 길이 없는 마커
                continue;
            }

            // SOF0~15 중 DHT(C4)·JPG(C8)·DAC(CC)를 뺀 것이 프레임 헤더다. EXIF 썸네일은 APP1 안이라 건너뛴다
            if (marker is >= 0xC0 and <= 0xCF and not 0xC4 and not 0xC8 and not 0xCC)
            {
                return ((b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]);
            }
            i += 2 + ((b[i + 2] << 8) | b[i + 3]);
        }
        return null;
    }
}
