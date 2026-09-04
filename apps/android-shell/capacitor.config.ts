import type { CapacitorConfig } from '@capacitor/cli';

// 三个角色（前台/厨房/点餐台）共用这一份配置，靠 Gradle product flavor 区分
// applicationId/图标/启动路径（见 android/app/build.gradle）。门店服务器地址不写在
// 这里——写死进配置就要为每家店重新签包，改成运行时在 MainActivity 里读用户填的地址
// （见 MainActivity 里的 ServerConfig 逻辑），这里只需要放开局域网内网段的明文 HTTP 访问。
const config: CapacitorConfig = {
  appId: 'com.restaurant.terminal',
  appName: 'Restaurant Terminal',
  webDir: 'www',
  server: {
    cleartext: true,
    allowNavigation: [
      '192.168.*',
      '10.*',
      '172.16.*', '172.17.*', '172.18.*', '172.19.*',
      '172.20.*', '172.21.*', '172.22.*', '172.23.*',
      '172.24.*', '172.25.*', '172.26.*', '172.27.*',
      '172.28.*', '172.29.*', '172.30.*', '172.31.*',
      'localhost',
    ],
  },
};

export default config;
