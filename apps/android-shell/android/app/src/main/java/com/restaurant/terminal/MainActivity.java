package com.restaurant.terminal;

import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.FrameLayout;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

// 前台/厨房/点餐台三个 flavor 共用这一份 MainActivity，靠各自的 BuildConfig.START_PATH
// 区分打开哪个路由（见 app/build.gradle 的 productFlavors）。
//
// 门店服务器地址不写死进安装包：写死的话每换一家店部署就要改配置重新签包，
// 违背这个项目"同一个安装包 + 运行时配置"的产品化原则（对应 docs/ARCHITECTURE.md
// §2.7 关于 StoreConfig 的决策）。改成首次启动弹一个原生输入框让店员填一次局域网地址，
// 存进普通的 SharedPreferences（纯原生场景，不需要走 Capacitor Preferences 插件那一层）。
public class MainActivity extends BridgeActivity {
    private static final String PREFS_NAME = "terminal_prefs";
    private static final String KEY_SERVER_BASE_URL = "server_base_url";

    private int cornerTapCount = 0;
    private long lastCornerTapAt = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        applyImmersiveFullscreen();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        addServerResetTapTarget();

        loadStoredOrPromptForServer();
    }

    // 全屏沉浸式：厨房看板/点餐台是无人值守常亮屏，前台也不需要系统状态栏/导航栏
    // 分走注意力——隐藏状态栏和导航栏，手势可以短暂唤出但会自动收回
    private void applyImmersiveFullscreen() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    // WebView 本身占满整个屏幕，没有原生标题栏可以长按——改成在左上角盖一个透明的
    // 60dp 见方小视图，连续点 5 下（3 秒内）就重新弹出"设置服务器地址"，不影响
    // 屏幕其他地方的正常点餐/看板操作
    private void addServerResetTapTarget() {
        FrameLayout tapTarget = new FrameLayout(this);
        int sizePx = (int) (60 * getResources().getDisplayMetrics().density);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(sizePx, sizePx);
        tapTarget.setLayoutParams(params);
        tapTarget.setOnClickListener(v -> onCornerTap());
        addContentView(tapTarget, params);
    }

    private void onCornerTap() {
        long now = System.currentTimeMillis();
        if (now - lastCornerTapAt > 3000) {
            cornerTapCount = 0;
        }
        lastCornerTapAt = now;
        cornerTapCount++;
        if (cornerTapCount >= 5) {
            cornerTapCount = 0;
            promptForServerAddress();
        }
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
    }

    private void loadStoredOrPromptForServer() {
        String saved = prefs().getString(KEY_SERVER_BASE_URL, null);
        if (saved == null || saved.isEmpty()) {
            promptForServerAddress();
        } else {
            loadStartPath(saved);
        }
    }

    private void promptForServerAddress() {
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("例如 192.168.1.50 或 192.168.1.50:8080");
        String current = prefs().getString(KEY_SERVER_BASE_URL, null);
        if (current != null) {
            input.setText(stripScheme(current));
        }

        int paddingPx = (int) (20 * getResources().getDisplayMetrics().density);
        FrameLayout container = new FrameLayout(this);
        FrameLayout.LayoutParams inputParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        inputParams.leftMargin = paddingPx;
        inputParams.rightMargin = paddingPx;
        inputParams.topMargin = paddingPx;
        container.addView(input, inputParams);

        new AlertDialog.Builder(this)
                .setTitle("门店服务器地址")
                .setMessage("首次使用需要填一次门店局域网服务器地址，之后不用重填；服务器换了 IP 时可以在左上角连点 5 下重新设置")
                .setView(container)
                .setCancelable(false)
                .setPositiveButton("确定", (dialog, which) -> {
                    String raw = input.getText().toString().trim();
                    if (raw.isEmpty()) {
                        promptForServerAddress();
                        return;
                    }
                    String normalized = normalizeBaseUrl(raw);
                    prefs().edit().putString(KEY_SERVER_BASE_URL, normalized).apply();
                    loadStartPath(normalized);
                })
                .show();
    }

    private String stripScheme(String url) {
        return url.replaceFirst("^https?://", "");
    }

    private String normalizeBaseUrl(String raw) {
        String value = raw.trim();
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            value = "http://" + value;
        }
        // 去掉结尾的斜杠，避免拼出 "http://host//front-desk" 这种双斜杠
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private void loadStartPath(String baseUrl) {
        String url = baseUrl + BuildConfig.START_PATH;
        WebView webView = getBridge().getWebView();
        webView.post(() -> webView.loadUrl(url));
    }

    @Override
    public void onBackPressed() {
        // 前台/厨房/点餐台都是固定摆在店里的终端，不应该退到安卓桌面——
        // WebView 自己历史记录里能后退就后退（比如前台在子路由间跳转），
        // 到底了就什么都不做，而不是走系统默认的"退出 Activity"
        WebView webView = getBridge().getWebView();
        if (webView.canGoBack()) {
            webView.goBack();
        }
    }
}
