using System.Collections.Concurrent;
using System.Diagnostics;

namespace Mdv.CameraHost;

/// <summary>
/// 카메라 호출을 전담하는 단일 스레드.
/// 명령 처리 → 이벤트 펌프 → 라이브뷰 프레임 수집을 한 루프에서 돌린다.
/// EDSDK는 호출 스레드를 고정해 두는 편이 안전해 처음부터 이 구조로 둔다 (SDK 문서로 재확인 예정).
/// 촬영 중에는 루프가 블록되어 라이브뷰가 잠시 멈춘다 — 실제 카메라의 블랙아웃과 같다.
/// </summary>
public sealed class CameraWorker : IDisposable
{
    private const int LiveViewFps = 24;
    private const int IdleWaitMs = 50;

    private readonly BlockingCollection<Action> _queue = new();
    private readonly ICamera _camera;
    private readonly LiveViewServer _liveView;
    private readonly Thread _thread;

    private volatile bool _stopping;
    private bool _liveOn;
    private long _nextFrameAt;

    public CameraWorker(ICamera camera, LiveViewServer liveView)
    {
        _camera = camera;
        _liveView = liveView;
        _camera.Disconnected += _ => TurnLiveViewOff();

        _thread = new Thread(Loop) { IsBackground = true, Name = "camera" };
        // EDSDK 이벤트 수신에 대비해 STA로 시작한다 (SDK 문서로 재확인 예정)
        _thread.SetApartmentState(ApartmentState.STA);
        _thread.Start();
    }

    /// <summary>워커 스레드에서만 읽고 쓰는 값이라 Run 안에서 호출해야 한다.</summary>
    public bool LiveViewOn => _liveOn;

    public Task<T> Run<T>(Func<ICamera, T> work)
    {
        var done = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
        _queue.Add(() =>
        {
            try
            {
                done.TrySetResult(work(_camera));
            }
            catch (Exception e)
            {
                done.TrySetException(e);
            }
        });
        return done.Task;
    }

    public void StartLiveView()
    {
        _camera.StartLiveView();
        _liveOn = true;
        _nextFrameAt = 0;
    }

    public void StopLiveView()
    {
        _camera.StopLiveView();
        TurnLiveViewOff();
    }

    public void Dispose()
    {
        _stopping = true;
        _queue.CompleteAdding();
        _thread.Join(TimeSpan.FromSeconds(3));
        _queue.Dispose();
    }

    private void TurnLiveViewOff()
    {
        _liveOn = false;
        _liveView.Reset();
    }

    private void Loop()
    {
        var frameInterval = Stopwatch.Frequency / LiveViewFps;

        while (!_stopping)
        {
            try
            {
                if (_queue.TryTake(out var job, WaitBudgetMs()))
                {
                    job();
                    continue;
                }
            }
            catch (InvalidOperationException)
            {
                return; // CompleteAdding 이후
            }

            try
            {
                _camera.Pump();

                var now = Stopwatch.GetTimestamp();
                if (_liveOn && now >= _nextFrameAt)
                {
                    // 대기 시간 오차가 쌓이지 않도록 지난 예정 시각에서 이어 계산한다
                    _nextFrameAt = Math.Max(_nextFrameAt + frameInterval, now);
                    var frame = _camera.GetLiveViewFrame();
                    if (frame is not null) _liveView.Publish(frame);
                }
            }
            catch (Exception e)
            {
                // 프레임 한 장 실패로 호스트를 죽이지 않는다. 연결 끊김은 Disconnected로 따로 온다.
                Console.Error.WriteLine($"camera loop: {e.Message}");
            }
        }
    }

    private int WaitBudgetMs()
    {
        if (!_liveOn) return IdleWaitMs;
        var ticks = _nextFrameAt - Stopwatch.GetTimestamp();
        return ticks <= 0 ? 0 : (int)(ticks * 1000 / Stopwatch.Frequency);
    }
}
