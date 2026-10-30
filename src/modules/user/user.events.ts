import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/** 用户域事件载荷（事件契约；跨进程 MQ 实现应复用同一结构） */
export interface UserChangedEvent {
  action: 'created' | 'updated' | 'deleted';
  userId: string;
  username: string;
  actorUsername: string | null;
}

/**
 * 用户域事件监听（进程内事件总线 EventEmitter2）。
 * 解耦演示：下游副作用（通知/索引/统计）不再内联在 Service 主流程中；
 * 跨进程需求可按同一事件契约替换为 BullMQ/RabbitMQ 等消息队列实现。
 */
@Injectable()
export class UserEventsListener {
  private readonly logger = new Logger(UserEventsListener.name);

  @OnEvent('user.changed')
  handleUserChanged(event: UserChangedEvent): void {
    this.logger.log(
      `用户域事件: ${event.action} ${event.username} (by ${event.actorUsername ?? 'system'})`,
    );
    // 演示扩展点：发送欢迎通知 / 同步搜索索引 / 埋点统计……
  }
}
