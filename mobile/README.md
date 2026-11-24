# Rayomand Mobile (Kotlin Multiplatform + Compose)

Native Android and iOS app for the CMS: sign-in, notification feed, content
list, and comment moderation — the daily-use screens, not the full admin.

The app talks to the `/api/mobile/*` endpoints (bearer token, no cookies),
which are implemented and tested in the CMS. Shared networking, models, and
screen state live in `:shared`; the Compose UI in `:composeApp` runs on both
platforms.

It also ships a **server-install helper**: from the sign-in screen, "Install the
CMS on your server" builds the exact command that clones the official repository
and runs the installer over SSH (Docker or bare metal). The repository URL lives
in [`ProjectInfo.kt`](shared/src/commonMain/kotlin/com/rayomand/mobile/shared/ProjectInfo.kt).

Prebuilt Android APKs are published on the repository's **Releases** page.

---

## Layout

```
mobile/
  shared/          KMP module: Ktor client, DTOs, SessionStore, AppViewModel
    commonMain/    code shared by Android + iOS
    androidMain/   OkHttp engine, SharedPreferences settings
    iosMain/       Darwin engine, NSUserDefaults settings
  composeApp/      Compose Multiplatform UI (Android + iOS)
    commonMain/    App.kt (sign-in, home, tabs)
    androidMain/   MainActivity, Application
    iosMain/       MainViewController() for SwiftUI
```

## Build requirements

- **JDK 17** (the build fails with a clear "JAVA_HOME is not set" error if
  missing). Android Studio bundles one; or install Temurin 17.
- Android SDK with platform 35 (already required by `compileSdk`).
- For iOS: Xcode 15+ and macOS.

## Android

```bash
cd mobile
./gradlew :composeApp:assembleDebug
# APK: composeApp/build/outputs/apk/debug/composeApp-debug.apk
```

Install on a running emulator:

```bash
adb install -r composeApp/build/outputs/apk/debug/composeApp-debug.apk
```

The emulator reaches the host's CMS at `http://10.0.2.2:3131` (the default
server address in the sign-in screen). On a physical device, open the sign-in
screen and replace the address with your server's LAN IP or domain.

## iOS

Open `mobile/` in Android Studio? No — open it with the Kotlin Multiplatform
plugin, or generate an Xcode project:

```bash
cd mobile
./gradlew :composeApp:linkDebugFrameworkIosSimulatorArm64
```

Then create an Xcode app that calls `MainViewController()` from `ComposeApp`
and sets it as the root. A full Xcode project file is intentionally not
committed; the framework is the stable boundary.

---

## Sign-in and the device id

1. Enter server address, username, password.
2. The app POSTs `/api/mobile/auth`; the CMS returns a bearer token (90 days by
   default) and registers the device.
3. The token and a generated device id are stored with `multiplatform-settings`.
4. Every subsequent call sends `Authorization: Bearer <token>`.

To cut off a lost phone: **Studio → Mobile** lists devices and tokens and can
revoke the token; the next request from that device gets `401`.

## Polling model

The app polls `/api/mobile/notifications?since=<last_id>` (foreground). The CMS
does not send push — there is no vendor push service in the loop. That keeps the
install self-contained; providers can add FCM/APNs later without changing the
CMS data model.

---

## What is verified

- **The Android APK was built and run on an emulator (Android 36).** Sign-in
  against the live CMS succeeded, and all three tabs (Alerts, Content, Review)
  rendered. A real order-status change on the server produced a live
  "Order #… → completed" alert in the app; tapping Read cleared it and the
  unread badge; the device auto-registered in the CMS.
- Every `/api/mobile/*` endpoint was exercised directly as well: login →
  bearer token, bootstrap, notification feed, mark-read, content list,
  moderation list, device registration.
- **iOS** shares the same `:shared` code and `App.kt` UI; the Darwin engine and
  `NSUserDefaults` storage are wired. The iOS framework was not built here
  (no macOS/Xcode), so run `./gradlew :composeApp:linkDebugFrameworkIos…` on a
  Mac to produce it.

### Build note for restricted networks

Google's Maven host (`dl.google.com/dl/android/maven2`) returns 404 through
some corporate proxies. `settings.gradle.kts` lists the Aliyun mirror first for
that reason; remove those lines if your network reaches Google directly.

