using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Mdv.CameraHost;

/// <summary>
/// 진입점 — stdin/stdout JSON Lines 프로토콜.
///
///   요청  {"id":1,"cmd":"capture","path":"C:\\...\\cut_01.jpg"}
///   응답  {"type":"response","id":1,"ok":true,"result":{...}}
///         {"type":"response","id":1,"ok":false,"error":{"code":"...","message":"..."}}
///   알림  {"type":"ready","protocol":1,"backend":"fake"}
///         {"type":"event","event":"disconnected","message":"..."}
///
/// stdout은 프로토콜 전용, 로그는 stderr로만 쓴다.
/// stdin이 닫히면 종료한다 — Electron이 죽어도 카메라 USB 세션을 붙든 채 남지 않게 하기 위해서다.
/// 계약의 Node 쪽은 src/main/camera.ts.
/// </summary>
internal static class Program
{
    private const int ProtocolVersion = 1;
    private const int ExitBackendUnavailable = 2;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly object WriteGate = new();
    private static StreamWriter _out = StreamWriter.Null;

    private static async Task<int> Main(string[] args)
    {
        _out = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false))
        {
            AutoFlush = true,
            NewLine = "\n",
        };

        var backend = ArgValue(args, "--backend") ?? "fake";
        string? unavailable = backend switch
        {
            "fake" => null,
            // DLL이 없으면 첫 연결에서야 터지므로 기동할 때 미리 알린다
            "edsdk" when !File.Exists(Path.Combine(AppContext.BaseDirectory, "EDSDK.dll")) =>
                $"EDSDK.dll이 없습니다 ({AppContext.BaseDirectory}) — camera-host/edsdk에 64비트 DLL을 넣고 다시 빌드하세요",
            "edsdk" => null,
            _ => $"지원하지 않는 카메라 백엔드입니다: {backend}",
        };
        if (unavailable is not null)
        {
            Emit(new JsonObject
            {
                ["type"] = "fatal",
                ["code"] = "backend-unavailable",
                ["message"] = unavailable,
            });
            return ExitBackendUnavailable;
        }

        using ICamera camera = backend == "edsdk" ? new EdsdkCamera() : new FakeCamera();
        using var liveView = new LiveViewServer();
        using var worker = new CameraWorker(camera, liveView);

        camera.Disconnected += message => Emit(new JsonObject
        {
            ["type"] = "event",
            ["event"] = "disconnected",
            ["message"] = message,
        });

        Emit(new JsonObject
        {
            ["type"] = "ready",
            ["protocol"] = ProtocolVersion,
            ["backend"] = camera.Backend,
        });

        using var input = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
        var inFlight = new List<Task>();

        while (await input.ReadLineAsync() is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;

            JsonObject request;
            try
            {
                request = JsonNode.Parse(line)?.AsObject()
                    ?? throw new JsonException("빈 요청");
            }
            catch (Exception e) when (e is JsonException or InvalidOperationException)
            {
                Console.Error.WriteLine($"잘못된 요청: {e.Message}");
                continue;
            }

            var id = request["id"]?.GetValue<long>() ?? -1;
            var cmd = request["cmd"]?.GetValue<string>() ?? "";

            if (cmd == "shutdown")
            {
                Respond(id, new { });
                break;
            }

            // 촬영처럼 오래 걸리는 명령 중에도 stdin을 계속 읽는다. 순서는 워커 큐가 보장한다.
            inFlight.RemoveAll(t => t.IsCompleted);
            inFlight.Add(HandleAsync(id, cmd, request, worker, liveView));
        }

        await Task.WhenAll(inFlight);
        await worker.Run(c =>
        {
            if (c.IsConnected) c.Disconnect();
            return true;
        });
        return 0;
    }

    private static async Task HandleAsync(
        long id,
        string cmd,
        JsonObject request,
        CameraWorker worker,
        LiveViewServer liveView)
    {
        try
        {
            object result = cmd switch
            {
                "status" => await worker.Run(c => (object)new
                {
                    connected = c.IsConnected,
                    liveView = worker.LiveViewOn,
                    backend = c.Backend,
                }),
                "connect" => await worker.Run(c => c.Connect()),
                "disconnect" => await worker.Run(c =>
                {
                    worker.StopLiveView();
                    c.Disconnect();
                    return (object)new { };
                }),
                "startLiveView" => await worker.Run(_ =>
                {
                    worker.StartLiveView();
                    return (object)new { url = liveView.Url };
                }),
                "stopLiveView" => await worker.Run(_ =>
                {
                    worker.StopLiveView();
                    return (object)new { };
                }),
                "capture" => await Capture(request, worker),
                "simulateDisconnect" => await worker.Run(c =>
                {
                    if (c is not FakeCamera fake)
                    {
                        throw new CameraException("unsupported", "가짜 카메라에서만 쓸 수 있습니다");
                    }
                    fake.SimulateDisconnect();
                    return (object)new { };
                }),
                _ => throw new CameraException("unknown-command", $"알 수 없는 명령: {cmd}"),
            };

            Respond(id, result);
        }
        catch (CameraException e)
        {
            RespondError(id, e.Code, e.Message);
        }
        catch (Exception e)
        {
            RespondError(id, "internal", e.Message);
        }
    }

    private static Task<CapturedPhoto> Capture(JsonObject request, CameraWorker worker)
    {
        var path = request["path"]?.GetValue<string>();
        if (string.IsNullOrEmpty(path) || !Path.IsPathFullyQualified(path))
        {
            throw new CameraException("bad-path", "capture에는 절대경로가 필요합니다");
        }
        return worker.Run(c => c.Capture(path));
    }

    private static void Respond(long id, object result) => Emit(new JsonObject
    {
        ["type"] = "response",
        ["id"] = id,
        ["ok"] = true,
        ["result"] = JsonSerializer.SerializeToNode(result, result.GetType(), Json),
    });

    private static void RespondError(long id, string code, string message) => Emit(new JsonObject
    {
        ["type"] = "response",
        ["id"] = id,
        ["ok"] = false,
        ["error"] = new JsonObject { ["code"] = code, ["message"] = message },
    });

    private static void Emit(JsonObject message)
    {
        lock (WriteGate)
        {
            _out.WriteLine(message.ToJsonString());
        }
    }

    private static string? ArgValue(string[] args, string name)
    {
        var i = Array.IndexOf(args, name);
        return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
    }
}
