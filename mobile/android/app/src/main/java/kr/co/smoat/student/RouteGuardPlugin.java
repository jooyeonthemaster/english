package kr.co.smoat.student;

import android.net.Uri;

import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge-safe navigation guard for the SMOAT student shell.
 *
 * Capacitor calls shouldOverrideLoad(Uri) for every hard navigation the WebView is
 * about to perform (see com.getcapacitor.Bridge#launchIntent). We use ONLY this
 * official hook — the WebViewClient is never replaced, which would break the
 * Capacitor bridge.
 *
 *   return null  -> defer to Capacitor's default policy (external hosts are opened
 *                   in the system browser)
 *   return false -> allow the load inside the WebView
 *   return true  -> abort the load and stay on the current page
 *
 * This allowlist is also the factual basis for the store age-rating claim
 * ("unrestricted web access = no"): only smoat.co.kr app surfaces load in-app,
 * every other host is delegated out.
 *
 * Note: SPA soft navigations (history pushState within /g) do not trigger this
 * hook, so in-app client-side routing is unaffected; only hard loads are gated.
 */
@CapacitorPlugin(name = "RouteGuard")
public class RouteGuardPlugin extends Plugin {

    private static final String APP_HOST = "www.smoat.co.kr";

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        if (url == null) {
            return null;
        }
        String host = url.getHost();
        // External host -> defer to Capacitor's default policy (system browser).
        if (host == null || !APP_HOST.equals(host)) {
            return null;
        }
        String path = url.getPath();
        if (path == null) {
            path = "";
        }
        if (isAllowedPath(path)) {
            return false; // allow inside the WebView
        }
        // Marketing root ("/"): delegate to the system browser instead of a silent
        // abort. A silent abort here would strand the user on a blank page with no
        // recovery (e.g. if /g ever 307-redirects to "/" when the feature flag is
        // off). Trigger is near-zero, but the blank failure mode is bad; opening the
        // marketing site externally is a graceful fallback and preserves the
        // no-in-app-purchase seal (marketing/commerce never loads in-app).
        if (path.isEmpty() || path.equals("/")) {
            return null;
        }
        // Same host but out of scope (e.g. /director): block silently and keep the
        // current page (no redirect -> no loop).
        return true;
    }

    /**
     * Uri.getPath() strips the query string, so equals("/g") / startsWith("/g/")
     * correctly cover /g and /g?ac=..&sc=.. alike.
     */
    private boolean isAllowedPath(String path) {
        // Student app surfaces.
        if (path.equals("/g") || path.startsWith("/g/")) {
            return true;
        }
        if (path.equals("/t") || path.startsWith("/t/")) {
            return true;
        }
        if (path.equals("/a") || path.startsWith("/a/")) {
            return true;
        }
        // Framework / API prefixes.
        if (path.equals("/api") || path.startsWith("/api/")) {
            return true;
        }
        if (path.startsWith("/_next/")) {
            return true;
        }
        if (path.startsWith("/favicon") || path.startsWith("/manifest")) {
            return true;
        }
        // Static asset extensions (scripts, styles, images, fonts, data).
        return path.endsWith(".js")
                || path.endsWith(".css")
                || path.endsWith(".png")
                || path.endsWith(".jpg")
                || path.endsWith(".jpeg")
                || path.endsWith(".gif")
                || path.endsWith(".webp")
                || path.endsWith(".svg")
                || path.endsWith(".ico")
                || path.endsWith(".woff")
                || path.endsWith(".woff2")
                || path.endsWith(".ttf")
                || path.endsWith(".json")
                || path.endsWith(".map")
                || path.endsWith(".txt");
    }
}
