export class GameLoop {
  private lastTime: number = 0;
  private isRunning: boolean = false;
  private timerId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly tickIntervalMs: number,
    private readonly onTick: (dtSeconds: number) => void
  ) {}

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = Date.now();

    this.timerId = setInterval(() => {
      const now = Date.now();
      const dtSeconds = (now - this.lastTime) / 1000;
      this.lastTime = now;
      this.onTick(dtSeconds);
    }, this.tickIntervalMs);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public get running(): boolean {
    return this.isRunning;
  }
}
