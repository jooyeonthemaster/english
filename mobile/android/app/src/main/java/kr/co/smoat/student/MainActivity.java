package kr.co.smoat.student;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * SMOAT student shell.
 *
 * The WebView loads the remote origin directly (server.url = https://www.smoat.co.kr/g).
 * Because the remote page cannot carry our Capacitor JS listeners, every shell-level
 * behaviour is handled natively here:
 *   - RouteGuardPlugin registration (bridge-safe navigation allowlist),
 *   - deep-link routing (App Links + smoat:// custom scheme),
 *   - portrait lock on phones (free on tablets),
 *   - dark status/navigation-bar icons on the light paper background,
 *   - OS font-scale clamp,
 *   - paper-coloured WebView background (no white flash before the remote paint).
 *
 * Pure Java + existing capacitor/androidx classes only. No new native dependencies.
 */
public class MainActivity extends BridgeActivity {

    private static final String PAPER_COLOR = "#f6f5f1";
    private static final String WEB_HOST = "www.smoat.co.kr";
    private static final String WEB_ORIGIN = "https://www.smoat.co.kr";

    /**
     * Last deep-link target, kept so an offline tap can be re-issued (with its
     * ?ac&sc) once the app returns to the foreground. The bare offline.html
     * recovery navigates to https://www.smoat.co.kr/g and would otherwise drop the
     * query, stranding a first-login student on an empty form.
     */
    private String pendingDeepLink = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the route guard BEFORE super.onCreate so the bridge picks it up
        // while it is being built. (bridgeBuilder is a BridgeActivity field
        // initializer, so it already exists at this point.)
        registerPlugin(RouteGuardPlugin.class);

        super.onCreate(savedInstanceState);

        // WebView background = paper colour, so there is no white flash before the
        // remote page paints. Guarded because the bridge/WebView is absent when the
        // system WebView package is missing (BridgeActivity no_webview fallback).
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setBackgroundColor(Color.parseColor(PAPER_COLOR));
        }

        // Dark system-bar icons on the light (#f6f5f1) paper background.
        // androidx.core 1.17.0 WindowInsetsControllerCompat exposes only the boolean
        // setters (verified via javap: no setAppearance(int,int) / APPEARANCE_*
        // constants exist), so we use setAppearanceLight*Bars(true) — same intent.
        // On target SDK 36 edge-to-edge is OS-enforced; the status bar overlays the
        // WebView and insets are handled by /g gd.css env(safe-area-inset-*), so no
        // native padding is added here.
        WindowInsetsControllerCompat insetsController =
                WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insetsController.setAppearanceLightStatusBars(true);
        insetsController.setAppearanceLightNavigationBars(true);

        // Orientation: portrait-locked on phones (res/values/bools.xml), free on
        // tablets (res/values-sw600dp/bools.xml). android:screenOrientation is
        // intentionally NOT declared in the manifest — this Java owns orientation.
        if (getResources().getBoolean(R.bool.portrait_only)) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        }

        // Font-scale clamp: honour OS accessibility scaling but cap it at 130% so
        // the dense student UI does not collapse. If fixed-height components are
        // observed overflowing on-device, lower the 1.3f cap to 1.2f.
        // Honour OS font scaling in BOTH directions but bound it to [85%, 130%] so
        // the dense student UI neither collapses (too large) nor becomes unreadable
        // (too small). Earlier a 1.0 floor overrode users who intentionally shrink
        // system fonts; 0.85 respects that while keeping a sane minimum. If
        // fixed-height components overflow on-device, lower the 1.3f cap to 1.2f.
        float fontScale = getResources().getConfiguration().fontScale;
        float boundedScale = Math.max(0.85f, Math.min(fontScale, 1.3f));
        final int textZoom = Math.round(boundedScale * 100f);
        if (getBridge() != null && getBridge().getWebView() != null) {
            final WebView webView = getBridge().getWebView();
            webView.post(() -> webView.getSettings().setTextZoom(textZoom));
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        // super preserves Capacitor's plugin dispatch (bridge.onNewIntent).
        super.onNewIntent(intent);
        setIntent(intent);
        route(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Covers cold-start deep links (the launch intent, also replayed by
        // BridgeActivity.load()) and warm-start intents set in onNewIntent. A
        // consumed intent (data == null) no-ops here, so rotation / background
        // return does not re-run a deep link.
        route(getIntent());
        // If a deep link was requested but the shell fell back to offline.html
        // (offline at tap time), re-issue the full link now that we are back in the
        // foreground and possibly reconnected.
        retryPendingDeepLinkIfStranded();
    }

    /**
     * Resolve the intent's data to an in-app URL and load it once. The intent is
     * consumed (setData(null)) so a rotation or background return does not replay
     * it. A permanent "handled" flag is deliberately NOT used — it would block a
     * legitimate second deep link delivered later via onNewIntent. The target is
     * also remembered (pendingDeepLink) so an offline tap can be retried on resume.
     */
    private void route(Intent intent) {
        if (intent == null || intent.getData() == null) {
            return;
        }
        String target = resolve(intent.getData());
        if (target == null) {
            return;
        }
        if (getBridge() == null || getBridge().getWebView() == null) {
            // WebView not ready yet; leave the intent intact so onResume retries.
            return;
        }
        // Consume so onResume (and rotation/background return) will no-op for this
        // deep link. Done only once the load is about to be posted.
        intent.setData(null);
        pendingDeepLink = target;
        loadTarget(target);
    }

    /**
     * If a deep link was requested but the WebView is currently showing offline.html
     * (device was offline at tap time), re-issue the full deep-link URL — this
     * preserves the ?ac&sc that the bare offline.html recovery would drop. Once a
     * real page is showing, the pending link is cleared. Fires on every foreground
     * resume, so bringing the app back after fixing connectivity retries the link.
     */
    private void retryPendingDeepLinkIfStranded() {
        if (pendingDeepLink == null) {
            return;
        }
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        String current = getBridge().getWebView().getUrl();
        if (current == null) {
            return;
        }
        if (current.contains("offline.html")) {
            loadTarget(pendingDeepLink); // still stranded — try the full link again
        } else {
            pendingDeepLink = null;      // a real page loaded — nothing pending
        }
    }

    /** Post a WebView load on the UI thread, guarding a missing bridge/WebView. */
    private void loadTarget(String url) {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        final WebView webView = getBridge().getWebView();
        webView.post(() -> webView.loadUrl(url));
    }

    /**
     * Map an inbound Uri to an in-app https URL, or null to ignore.
     *   https://www.smoat.co.kr/...  (App Links)   -> the URL unchanged
     *   smoat://g?ac=A&sc=B          (custom scheme) -> https://www.smoat.co.kr/g?ac=A&sc=B
     *   anything else                                -> null
     * The remote /g page runs the ?ac&sc auto-login; the shell only loads the URL.
     */
    private String resolve(Uri data) {
        if (data == null) {
            return null;
        }
        String scheme = data.getScheme();
        String host = data.getHost();
        if ("https".equals(scheme) && WEB_HOST.equals(host)) {
            return data.toString();
        }
        if ("smoat".equals(scheme)) {
            String hostPart = host == null ? "" : "/" + host;
            String path = data.getPath() == null ? "" : data.getPath();
            String query = data.getQuery() == null ? "" : "?" + data.getQuery();
            return WEB_ORIGIN + hostPart + path + query;
        }
        return null;
    }
}
