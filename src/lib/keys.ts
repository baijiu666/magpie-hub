import type { Plugin } from "./data";

/** 作者身份：provider + 小写 owner，避免大小写导致重复。 */
export const ownerKey = (provider: string, owner: string) => `${provider}:${owner.toLowerCase()}`;

/** 插件身份：provider:owner/repo（owner 统一小写）。 */
export const pluginKey = (plugin: Pick<Plugin, "provider" | "owner" | "repo">) =>
  `${plugin.provider}:${plugin.owner.toLowerCase()}/${plugin.repo}`;
