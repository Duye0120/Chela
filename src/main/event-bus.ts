// ---------------------------------------------------------------------------
// Event Bus — 全局类型安全事件总线
// ---------------------------------------------------------------------------
//
// 所有模块间的事件通信都通过此总线。
// Harness 负责"能不能做"，Bus 负责"发生了什么"。
// ---------------------------------------------------------------------------

import { appLogger } from "./logger.js";

// ---------------------------------------------------------------------------
// Event Map — 所有已知事件及其 payload 类型
// ---------------------------------------------------------------------------

export type EventMap = {
  // ── Agent 生命周期 ──
  "run:created": { sessionId: string; runId: string; modelEntryId: string; runKind: string; lane: string };
  "run:started": { sessionId: string; runId: string; modelEntryId: string };
  "run:state_changed": { sessionId: string; runId: string; state: string; reason?: string; currentStepId?: string };
  "run:cancel_requested": { sessionId: string; runId: string };
  "run:completed": { sessionId: string; runId: string; finalState: string; reason?: string };
  "run:aborted": { sessionId: string; runId: string; reason?: string };
  "run:failed": { sessionId: string; runId: string; reason?: string };

  // ── 消息 ──
  "message:user": { sessionId: string; text: string };
  "message:assistant": { sessionId: string; runId: string };

  // ── 工具执行 ──
  "tool:executing": { sessionId: string; runId: string; toolName: string; toolCallId: string };
  "tool:completed": { sessionId: string; runId: string; toolName: string; toolCallId: string };
  "tool:failed": { sessionId: string; runId: string; toolName: string; toolCallId: string; error: string };
  "tool:policy_evaluated": { sessionId: string; runId: string; toolName: string; decision: string; riskLevel: string };

  // ── Harness 审批 ──
  "approval:requested": { sessionId: string; runId: string; requestId: string; toolName: string };
  "approval:resolved": { sessionId: string; runId: string; requestId: string; allowed: boolean };

  // ── 通知 ──
  "notification:sent": { title: string; body: string };
  "notification:external": { channel: string; message: string };

  // ── 诊断 ──
  "diagnosis:healthy": { checkId: string };
  "diagnosis:alert": { checkId: string; message: string; severity: string };
  "diagnosis:repaired": { checkId: string; message: string };

  // ── 插件（Phase 4 预留） ──
  "plugin:loaded": { pluginId: string; tools: string[] };
  "plugin:unloaded": { pluginId: string };

  // ── 调度 ──
  "schedule:triggered": { jobId: string; cronExpr: string };

  // ── Webhook ──
  "webhook:received": { source: string; event: string; payload: unknown };

  // ── 学习 ──
  "learning:insight": { type: string; toolName?: string; message: string };
  "learning:applied": { type: string; target: string; message: string };

  // ── 情感 ──
  "emotion:changed": { from: string; to: string; trigger: string };

  // ── 反思 ──
  "reflection:completed": { date: string; sessionCount: number; insightCount: number };
};

export const BUS_EVENTS = {
  RUN_CREATED: "run:created",
  RUN_STARTED: "run:started",
  RUN_STATE_CHANGED: "run:state_changed",
  RUN_CANCEL_REQUESTED: "run:cancel_requested",
  RUN_COMPLETED: "run:completed",
  RUN_ABORTED: "run:aborted",
  RUN_FAILED: "run:failed",
  MESSAGE_USER: "message:user",
  MESSAGE_ASSISTANT: "message:assistant",
  TOOL_EXECUTING: "tool:executing",
  TOOL_COMPLETED: "tool:completed",
  TOOL_FAILED: "tool:failed",
  TOOL_POLICY_EVALUATED: "tool:policy_evaluated",
  APPROVAL_REQUESTED: "approval:requested",
  APPROVAL_RESOLVED: "approval:resolved",
  NOTIFICATION_SENT: "notification:sent",
  NOTIFICATION_EXTERNAL: "notification:external",
  DIAGNOSIS_HEALTHY: "diagnosis:healthy",
  DIAGNOSIS_ALERT: "diagnosis:alert",
  DIAGNOSIS_REPAIRED: "diagnosis:repaired",
  PLUGIN_LOADED: "plugin:loaded",
  PLUGIN_UNLOADED: "plugin:unloaded",
  SCHEDULE_TRIGGERED: "schedule:triggered",
  WEBHOOK_RECEIVED: "webhook:received",
  LEARNING_INSIGHT: "learning:insight",
  LEARNING_APPLIED: "learning:applied",
  EMOTION_CHANGED: "emotion:changed",
  REFLECTION_COMPLETED: "reflection:completed",
} as const satisfies Record<string, keyof EventMap>;

export type BusEventName = (typeof BUS_EVENTS)[keyof typeof BUS_EVENTS];

// ---------------------------------------------------------------------------
// EventBus 实现
// ---------------------------------------------------------------------------

type Handler<T = unknown> = (data: T) => void;
type WildcardHandler = (event: BusEventName, data: unknown) => void;

class EventBus {
  private readonly listeners = new Map<keyof EventMap, Set<Handler>>();
  private readonly wildcardListeners = new Set<WildcardHandler>();

  /**
   * 订阅事件。返回取消订阅函数。
   */
  on<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler);
    return () => {
      set!.delete(handler as Handler);
      if (set!.size === 0) this.listeners.delete(event);
    };
  }

  /**
   * 一次性订阅。触发后自动取消。
   */
  once<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): () => void {
    const off = this.on(event, (data) => {
      off();
      handler(data);
    });
    return off;
  }

  /**
   * 通配符订阅 — 收到所有事件。用于审计/日志。
   */
  onAny(handler: WildcardHandler): () => void {
    this.wildcardListeners.add(handler);
    return () => {
      this.wildcardListeners.delete(handler);
    };
  }

  /**
   * 发射事件。同步调用所有 handler（handler 内部可以 async）。
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    // 具名监听器
    const set = this.listeners.get(event);
    if (set) {
      for (const handler of set) {
        try {
          handler(data);
        } catch (err) {
          appLogger.warn({
            scope: "event-bus",
            message: `handler error on "${event}"`,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    }

    // 通配符监听器
    for (const handler of this.wildcardListeners) {
      try {
        handler(event, data);
      } catch (err) {
        // M19: 通配符 handler 抛错不阻塞其他 handler，但需写日志，不能静默吞掉。
        appLogger.warn({
          scope: "event-bus",
          message: `wildcard handler error on "${event}"`,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
  }

  /**
   * 返回某个事件的当前监听器数量。
   */
  listenerCount(event: keyof EventMap): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  /**
   * 移除所有监听器（测试/清理用）。
   */
  removeAllListeners(): void {
    this.listeners.clear();
    this.wildcardListeners.clear();
  }
}

// ---------------------------------------------------------------------------
// 单例导出
// ---------------------------------------------------------------------------

export const bus = new EventBus();
