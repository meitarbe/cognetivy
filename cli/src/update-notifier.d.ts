declare module "update-notifier" {
  interface UpdateInfo {
    latest: string;
    current: string;
    type: string;
    name: string;
  }

  interface Options {
    pkg: { name: string; version: string };
    updateCheckInterval?: number;
    distTag?: string;
  }

  interface UpdateNotifierInstance {
    update?: UpdateInfo;
    fetchInfo(): Promise<UpdateInfo>;
    notify(options?: { message?: string; defer?: boolean }): this;
  }

  function updateNotifier(options: Options): UpdateNotifierInstance;
  export default updateNotifier;
}
