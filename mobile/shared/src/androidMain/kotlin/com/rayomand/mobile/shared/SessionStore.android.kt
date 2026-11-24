package com.rayomand.mobile.shared

import android.content.Context
import com.russhwolf.settings.SharedPreferencesSettings
import android.content.SharedPreferences
import java.security.SecureRandom

// Android side of the platform contracts. The app calls initAndroidSettings()
// once in Application.onCreate before using SessionStore.

private lateinit var appContext: Context

fun initAndroidSettings(context: Context) {
    appContext = context.applicationContext
}

actual fun createSettings(): com.russhwolf.settings.Settings {
    val prefs: SharedPreferences =
        appContext.getSharedPreferences("rayomand_session", Context.MODE_PRIVATE)
    return SharedPreferencesSettings(prefs)
}

actual fun randomToken(): String {
    val bytes = ByteArray(16)
    SecureRandom().nextBytes(bytes)
    return bytes.joinToString("") { "%02x".format(it) }
}
