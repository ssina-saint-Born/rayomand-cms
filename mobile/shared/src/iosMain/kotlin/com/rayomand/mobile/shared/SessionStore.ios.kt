package com.rayomand.mobile.shared

import com.russhwolf.settings.NSUserDefaultsSettings
import com.russhwolf.settings.Settings
import platform.Foundation.NSUserDefaults
import kotlin.random.Random

// iOS side of the platform contracts. NSUserDefaults is used directly; the
// token is not secret-grade storage, but it is a server-issued credential the
// operator can revoke, so a Keychain wrapper can replace this later without
// touching callers.

actual fun createSettings(): Settings =
    NSUserDefaultsSettings(NSUserDefaults.standardUserDefaults)

actual fun randomToken(): String =
    (0 until 16).joinToString("") { Random.nextInt(0, 256).toString(16).padStart(2, '0') }
