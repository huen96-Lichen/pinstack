import type { CapsuleEvent, CapsuleStatusPriority } from '../../../shared/types';

const PRIORITY_SCORE: Record<CapsuleStatusPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export class StatusPriorityQueue {
  private readonly maxLength: number;
  private queue: CapsuleEvent[] = [];

  public constructor(maxLength = 5) {
    this.maxLength = Math.max(1, Math.round(maxLength));
  }

  public push(event: CapsuleEvent): void {
    if (event.type === 'aiProcessingStarted') {
      this.queue = this.queue.filter((item) => item.type !== 'aiProcessingStarted');
    }
    this.queue.push(event);
    this.queue.sort((left, right) => {
      const priorityDelta = PRIORITY_SCORE[right.priority] - PRIORITY_SCORE[left.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return right.createdAt - left.createdAt;
    });
    if (this.queue.length > this.maxLength) {
      this.queue = this.queue.slice(0, this.maxLength);
    }
  }

  public consume(): CapsuleEvent | undefined {
    return this.queue.shift();
  }

  public size(): number {
    return this.queue.length;
  }

  public snapshot(): CapsuleEvent[] {
    return [...this.queue];
  }
}
