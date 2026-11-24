package com.rayomand.mobile.shared

import com.russhwolf.settings.Settings

// Persists the base URL and bearer token between launches. The Settings
// instance is supplied by the platform (SharedPreferences on Android,
// NSUserDefaults on iOS) via createSettings().

private const val KEY_BASE_URL = "rayomand.base_url"
private const val KEY_TOKEN = "rayomand.token"
private const val KEY_DEVICE_ID = "rayomand.device_id"

class SessionStore(private val settings: Settings = createSettings()) {
    var baseUrl: String
        get() = settings.getString(KEY_BASE_URL, "http://10.0.2.2:3131")
        set(value) = settings.putString(KEY_BASE_URL, value.trimEnd('/'))

    var token: String?
        get() = settings.getStringOrNull(KEY_TOKEN)
        set(value) {
            if (value == null) settings.remove(KEY_TOKEN) else settings.putString(KEY_TOKEN, value)
        }

    // The device id is created once and reused; it identifies this install to
    // the CMS so a lost phone can be cut off from Studio → Mobile.
    // Generated once and reused so this install is identifiable to the CMS.
    var deviceId: String
        get() = settings.getStringOrNull(KEY_DEVICE_ID) ?: randomToken().also { settings.putString(KEY_DEVICE_ID, it) }
        set(value) { settings.putString(KEY_DEVICE_ID, value) }

    fun clear() {
        token = null
    }
}

expect fun createSettings(): Settings

expect fun randomToken(): String
