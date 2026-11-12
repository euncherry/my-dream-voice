using System.Runtime.InteropServices;

namespace Mdv.CameraHost;

/// <summary>
/// Canon EDSDK P/Invoke 선언 — EdsdkCamera가 쓰는 함수·상수만 둔다.
///
/// EDSDK.dll·EdsImage.dll(64비트)은 CameraHost.exe 옆에 둔다 (csproj가 camera-host/edsdk에서 복사).
/// 기준 버전: EDSDK 13.21 — 13.x부터 크기 인자가 64비트(EdsUInt64)다.
/// ⚠️ DLL은 앱 패키지에만 포함한다. 단독 배포 금지 (Canon 이용약관).
/// </summary>
internal static class Edsdk
{
    private const string Dll = "EDSDK.dll";

    // ── 오류 코드 ─────────────────────────────────────────────
    public const uint ErrOk = 0x00000000;
    public const uint ErrDeviceNotFound = 0x00000080;
    public const uint ErrDeviceBusy = 0x00000081;
    public const uint ErrCommPortInUse = 0x000000C0;
    public const uint ErrCommDisconnected = 0x000000C1;
    public const uint ErrCommUsbBus = 0x000000C4;
    public const uint ErrSessionNotOpen = 0x00002003;
    public const uint ErrObjectNotReady = 0x0000A102;
    public const uint ErrTakePictureAfNg = 0x00008D01;
    public const uint ErrTakePictureNoCardNg = 0x00008D06;
    public const uint ErrTakePictureCardNg = 0x00008D07;

    // ── 속성 ──────────────────────────────────────────────────
    public const uint PropProductName = 0x00000002;
    public const uint PropSaveTo = 0x0000000B;
    public const uint PropEvfOutputDevice = 0x00000500;
    public const uint PropEvfMode = 0x00000501;

    public const uint SaveToHost = 2;
    public const uint EvfOutputTft = 1;
    public const uint EvfOutputPc = 2;

    // ── 명령 ──────────────────────────────────────────────────
    public const uint CmdExtendShutDownTimer = 0x00000001;
    public const uint CmdPressShutterButton = 0x00000004;

    public const int ShutterOff = 0x00000000;
    public const int ShutterCompletely = 0x00000003;
    public const int ShutterCompletelyNonAf = 0x00010003;

    // ── 이벤트 ────────────────────────────────────────────────
    public const uint ObjectEventAll = 0x00000200;
    public const uint ObjectEventDirItemRequestTransfer = 0x00000208;

    public const uint StateEventAll = 0x00000300;
    public const uint StateEventShutdown = 0x00000301;
    public const uint StateEventWillSoonShutDown = 0x00000303;
    public const uint StateEventCaptureError = 0x00000305;
    public const uint StateEventInternalError = 0x00000306;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DeviceInfo
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string PortName;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string DeviceDescription;

        public uint DeviceSubType;
        public uint Reserved;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DirectoryItemInfo
    {
        public ulong Size;
        public int IsFolder;
        public uint GroupId;
        public uint Option;

        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string FileName;

        public uint Format;
        public uint DateTime;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct Capacity
    {
        public int NumberOfFreeClusters;
        public int BytesPerSector;
        public int Reset;
    }

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    public delegate uint ObjectEventHandler(uint inEvent, IntPtr inRef, IntPtr inContext);

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    public delegate uint StateEventHandler(uint inEvent, uint inEventData, IntPtr inContext);

    // ── SDK ───────────────────────────────────────────────────
    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsInitializeSDK();

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsTerminateSDK();

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetEvent();

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsRelease(IntPtr inRef);

    // ── 카메라 목록·세션 ──────────────────────────────────────
    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetCameraList(out IntPtr outCameraListRef);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetChildCount(IntPtr inRef, out int outCount);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetChildAtIndex(IntPtr inRef, int inIndex, out IntPtr outRef);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetDeviceInfo(IntPtr inCameraRef, out DeviceInfo outDeviceInfo);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsOpenSession(IntPtr inCameraRef);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsCloseSession(IntPtr inCameraRef);

    // ── 이벤트 핸들러 ─────────────────────────────────────────
    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsSetObjectEventHandler(
        IntPtr inCameraRef, uint inEvent, ObjectEventHandler? inHandler, IntPtr inContext);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsSetCameraStateEventHandler(
        IntPtr inCameraRef, uint inEvent, StateEventHandler? inHandler, IntPtr inContext);

    // ── 속성·명령 ─────────────────────────────────────────────
    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetPropertySize(
        IntPtr inRef, uint inPropertyId, int inParam, out uint outDataType, out uint outSize);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetPropertyData(
        IntPtr inRef, uint inPropertyId, int inParam, uint inPropertySize, IntPtr outPropertyData);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsSetPropertyData(
        IntPtr inRef, uint inPropertyId, int inParam, uint inPropertySize, ref uint inPropertyData);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsSendCommand(IntPtr inCameraRef, uint inCommand, int inParam);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsSetCapacity(IntPtr inCameraRef, Capacity inCapacity);

    // ── 파일 전송 ─────────────────────────────────────────────
    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetDirectoryItemInfo(IntPtr inDirItemRef, out DirectoryItemInfo outDirItemInfo);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsDownload(IntPtr inDirItemRef, ulong inReadSize, IntPtr outStream);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsDownloadComplete(IntPtr inDirItemRef);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsDownloadCancel(IntPtr inDirItemRef);

    // ── 메모리 스트림 ─────────────────────────────────────────
    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsCreateMemoryStream(ulong inBufferSize, out IntPtr outStream);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetPointer(IntPtr inStream, out IntPtr outPointer);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsGetLength(IntPtr inStream, out ulong outLength);

    // ── 라이브뷰 ──────────────────────────────────────────────
    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsCreateEvfImageRef(IntPtr inStreamRef, out IntPtr outEvfImageRef);

    [DllImport(Dll, CallingConvention = CallingConvention.StdCall)]
    public static extern uint EdsDownloadEvfImage(IntPtr inCameraRef, IntPtr inEvfImageRef);

    /// <summary>스트림 내용을 관리 배열로 복사한다.</summary>
    public static byte[] CopyStream(IntPtr stream)
    {
        Check(EdsGetLength(stream, out var length), "스트림 길이");
        Check(EdsGetPointer(stream, out var pointer), "스트림 포인터");
        var bytes = new byte[checked((int)length)];
        Marshal.Copy(pointer, bytes, 0, bytes.Length);
        return bytes;
    }

    public static void Check(uint err, string what)
    {
        if (err != ErrOk) throw ToException(err, what);
    }

    public static bool IsCommLoss(uint err) =>
        err is ErrCommDisconnected or ErrCommUsbBus or ErrDeviceNotFound or ErrSessionNotOpen;

    /// <summary>EDSDK 오류를 프로토콜 오류 코드로 바꾼다. 메시지는 키오스크 운영자가 읽는다.</summary>
    public static CameraException ToException(uint err, string what)
    {
        var hex = $"EDSDK 0x{err:X8}";
        return err switch
        {
            ErrCommPortInUse or ErrDeviceBusy when what == "세션 열기" => new CameraException(
                "in-use", $"다른 프로그램이 카메라를 쓰고 있습니다. EOS Utility·EOS Webcam Utility를 종료하세요 ({hex})"),
            ErrDeviceBusy => new CameraException("busy", $"카메라가 처리 중입니다: {what} ({hex})"),
            _ when IsCommLoss(err) => new CameraException(
                "not-connected", $"카메라 연결이 끊겼습니다: {what} ({hex})"),
            ErrTakePictureAfNg => new CameraException(
                "capture-failed", $"초점을 맞추지 못해 촬영하지 못했습니다 ({hex})"),
            ErrTakePictureNoCardNg or ErrTakePictureCardNg => new CameraException(
                "capture-failed", $"카드 문제로 셔터가 잠겼습니다. 카메라 메뉴에서 '카드 없이 셔터 누르기'를 켜세요 ({hex})"),
            _ => new CameraException("sdk-error", $"{what} 실패 ({hex})"),
        };
    }
}
