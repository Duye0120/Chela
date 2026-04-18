import type { Settings } from "../../shared/contracts.js";
import { appLogger } from "../logger.js";
import { getSettings } from "../settings.js";
import {
  Agent,
  EnvHttpProxyAgent,
  type Dispatcher,
  setGlobalDispatcher,
} from "./undici.js";

let currentDispatcher: Dispatcher | null = null;

function createDirectDispatcher(): Dispatcher {
  return new Agent();
}

function normalizeProxyUrl(value: string): string {
  return value.trim();
}

function closeDispatcher(dispatcher: Dispatcher | null): void {
  if (!dispatcher || typeof dispatcher.close !== "function") {
    return;
  }

  void dispatcher.close().catch(() => undefined);
}

export function resolveNetworkTimeoutMs(settings = getSettings()): number {
  return settings.network.timeoutMs;
}

export function applyGlobalNetworkSettings(settings = getSettings()): void {
  const previousDispatcher = currentDispatcher;

  try {
    const proxyUrl = normalizeProxyUrl(settings.network.proxy.url);
    const proxyEnabled = settings.network.proxy.enabled && proxyUrl.length > 0;

    currentDispatcher = proxyEnabled
      ? new EnvHttpProxyAgent({
          httpProxy: proxyUrl,
          httpsProxy: proxyUrl,
          noProxy: settings.network.proxy.noProxy.trim(),
        })
      : createDirectDispatcher();

    setGlobalDispatcher(currentDispatcher);

    appLogger.info({
      scope: "network.proxy",
      message: proxyEnabled ? "已启用全局代理" : "已切回直连网络",
      data: proxyEnabled
        ? {
            proxyUrl,
            noProxy: settings.network.proxy.noProxy,
            timeoutMs: settings.network.timeoutMs,
          }
        : {
            timeoutMs: settings.network.timeoutMs,
          },
    });
  } catch (error) {
    currentDispatcher = createDirectDispatcher();
    setGlobalDispatcher(currentDispatcher);
    appLogger.error({
      scope: "network.proxy",
      message: "应用全局代理失败，已回退到直连",
      data: {
        enabled: settings.network.proxy.enabled,
        timeoutMs: settings.network.timeoutMs,
      },
      error,
    });
  } finally {
    if (previousDispatcher && previousDispatcher !== currentDispatcher) {
      closeDispatcher(previousDispatcher);
    }
  }
}
