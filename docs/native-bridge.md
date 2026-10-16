# Optional native bridge (for your Android / iOS app)

A web view cannot open the share menu with a file, show the print dialog, or show phone notifications on its own.
The web app detects a small bridge named `window.SCNative` and uses it when present. Without it, the app falls back to
links, "open in browser to print", and in-app reminder pop-ups. Capacitor plugins (Share, Filesystem, LocalNotifications, Browser) are detected automatically.

## Android (Kotlin)
```kotlin
class SCNative(private val act: Activity, private val web: WebView) {
  @JavascriptInterface fun sharePdf(b64: String, name: String, text: String) {
    val f = File(act.cacheDir, name); f.writeBytes(Base64.decode(b64, Base64.DEFAULT))
    val uri = FileProvider.getUriForFile(act, act.packageName + ".fileprovider", f)
    val i = Intent(Intent.ACTION_SEND).apply { type = "application/pdf"; putExtra(Intent.EXTRA_STREAM, uri); putExtra(Intent.EXTRA_TEXT, text); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }
    act.startActivity(Intent.createChooser(i, "Share"))
  }
  @JavascriptInterface fun printPage(job: String) = act.runOnUiThread {
    val pm = act.getSystemService(Context.PRINT_SERVICE) as PrintManager
    pm.print(job, web.createPrintDocumentAdapter(job), PrintAttributes.Builder().build())
  }
  @JavascriptInterface fun openExternal(url: String) = act.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
  // optional: [{id,title,body,at}] -> schedule with AlarmManager/WorkManager
  @JavascriptInterface fun scheduleNotifications(json: String) { /* ... */ }
  @JavascriptInterface fun notificationPermission(): String = "granted" // granted | denied | default
  @JavascriptInterface fun requestNotificationPermission() { /* then call window.onSCNotifPermission(state) */ }
}
// webView.settings.javaScriptEnabled = true; webView.addJavascriptInterface(SCNative(this, webView), "SCNative")
```
Add a `FileProvider` entry in the manifest for `cacheDir`.

## Notes
- Real background push to a customer's phone needs a server. Customers get a reminder page with a notification prompt and calendar links.
- Shared links contain the document data; anyone with the link can read it.
