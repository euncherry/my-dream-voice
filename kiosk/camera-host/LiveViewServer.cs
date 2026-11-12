using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;

namespace Mdv.CameraHost;

/// <summary>
/// 라이브뷰 MJPEG 스트림. 렌더러가 &lt;img src&gt;로 바로 받는다.
/// 초당 수십 장을 IPC(JSON/stdio)로 나르지 않기 위해 별도 소켓을 쓴다.
///
/// HttpListener(HTTP.sys)는 환경에 따라 URL 예약 권한이 필요해 TcpListener로 직접 구현한다.
/// loopback에만 바인딩하고 URL에 임의 토큰을 넣어 같은 PC의 다른 프로그램이 못 보게 한다.
/// 느린 클라이언트는 프레임을 건너뛴다 — 항상 최신 프레임만 보낸다.
/// </summary>
public sealed class LiveViewServer : IDisposable
{
    private const string Boundary = "mdvframe";
    private const int MaxRequestBytes = 8 * 1024;
    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(5);

    private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
    private readonly CancellationTokenSource _lifetime = new();
    private readonly object _gate = new();
    private readonly string _path = "/live/" + RandomNumberGenerator.GetHexString(32, lowercase: true);

    private CancellationTokenSource _clients = new();
    private TaskCompletionSource _frameArrived = NewSignal();
    private byte[]? _latest;
    private long _sequence;

    public LiveViewServer()
    {
        _listener.Start();
        _ = AcceptLoopAsync();
    }

    public string Url => $"http://127.0.0.1:{((IPEndPoint)_listener.LocalEndpoint).Port}{_path}";

    public void Publish(byte[] jpeg)
    {
        TaskCompletionSource signal;
        lock (_gate)
        {
            _latest = jpeg;
            _sequence++;
            signal = _frameArrived;
            _frameArrived = NewSignal();
        }
        signal.TrySetResult();
    }

    /// <summary>라이브뷰 정지 — 붙어 있는 클라이언트를 끊고 마지막 프레임을 버린다.</summary>
    public void Reset()
    {
        CancellationTokenSource old;
        lock (_gate)
        {
            _latest = null;
            old = _clients;
            _clients = new CancellationTokenSource();
        }
        old.Cancel();
        old.Dispose();
    }

    public void Dispose()
    {
        _lifetime.Cancel();
        _listener.Stop();
        Reset();
    }

    private static TaskCompletionSource NewSignal() =>
        new(TaskCreationOptions.RunContinuationsAsynchronously);

    private async Task AcceptLoopAsync()
    {
        try
        {
            while (!_lifetime.IsCancellationRequested)
            {
                var client = await _listener.AcceptTcpClientAsync(_lifetime.Token);
                _ = ServeAsync(client);
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (ObjectDisposedException)
        {
        }
    }

    private async Task ServeAsync(TcpClient client)
    {
        using (client)
        {
            try
            {
                client.NoDelay = true;
                var stream = client.GetStream();

                CancellationToken token;
                lock (_gate)
                {
                    token = _clients.Token;
                }

                var target = await ReadRequestTargetAsync(stream);
                if (target != _path)
                {
                    await WriteAsciiAsync(
                        stream,
                        "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                        CancellationToken.None);
                    return;
                }

                await StreamFramesAsync(stream, token);
            }
            catch (OperationCanceledException)
            {
            }
            catch (IOException)
            {
                // 렌더러가 src를 바꾸면 연결이 끊긴다 — 정상 경로
            }
            catch (SocketException)
            {
            }
            catch (ObjectDisposedException)
            {
            }
        }
    }

    private async Task StreamFramesAsync(NetworkStream stream, CancellationToken token)
    {
        await WriteAsciiAsync(
            stream,
            "HTTP/1.1 200 OK\r\n" +
            $"Content-Type: multipart/x-mixed-replace; boundary={Boundary}\r\n" +
            "Cache-Control: no-store\r\nConnection: close\r\n\r\n",
            token);

        long sent = 0;
        while (true)
        {
            byte[]? frame;
            long sequence;
            Task arrived;
            lock (_gate)
            {
                frame = _latest;
                sequence = _sequence;
                arrived = _frameArrived.Task;
            }

            if (frame is null || sequence == sent)
            {
                await arrived.WaitAsync(token);
                continue;
            }

            await WriteAsciiAsync(
                stream,
                $"--{Boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: {frame.Length}\r\n\r\n",
                token);
            await stream.WriteAsync(frame, token);
            await WriteAsciiAsync(stream, "\r\n", token);
            sent = sequence;
        }
    }

    /// <summary>요청 헤더 끝까지 읽고 경로만 돌려준다. GET이 아니거나 형식이 틀리면 null.</summary>
    private static async Task<string?> ReadRequestTargetAsync(NetworkStream stream)
    {
        using var timeout = new CancellationTokenSource(RequestTimeout);
        var buffer = new byte[MaxRequestBytes];
        var length = 0;

        while (length < buffer.Length)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(length), timeout.Token);
            if (read == 0) return null;
            length += read;

            var text = Encoding.ASCII.GetString(buffer, 0, length);
            if (!text.Contains("\r\n\r\n", StringComparison.Ordinal)) continue;

            var parts = text[..text.IndexOf('\r')].Split(' ');
            return parts.Length == 3 && parts[0] == "GET" ? parts[1] : null;
        }

        return null;
    }

    private static ValueTask WriteAsciiAsync(Stream stream, string text, CancellationToken token) =>
        stream.WriteAsync(Encoding.ASCII.GetBytes(text), token);
}
