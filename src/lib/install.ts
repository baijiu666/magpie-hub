import { copyWithToast } from "./clipboard";
import type { Plugin } from "./data";

/**
 * 能跳 magpie 就跳，否则复制安装命令；卡片和公告共用同一套行为。
 * 深链只认 npm 包名、且只是打开插件面板，不会自动安装（magpie 的设计）。
 */
export function installOrCopy(plugin: Plugin | undefined, canOpenInMagpie: boolean) {
  if (!plugin) return;

  if (plugin.npmVersion && canOpenInMagpie) {
    window.location.href = `magpie://plugin?name=${encodeURIComponent(plugin.npmName ?? plugin.repo)}`;
    // 系统没接管 magpie:// 时页面不会失焦，1.2 秒后兜底复制命令
    window.setTimeout(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        void copyWithToast(plugin.install, "没检测到 magpie 打开，安装命令已复制");
      }
    }, 1200);
    return;
  }

  void copyWithToast(plugin.install, "安装命令已复制");
}
