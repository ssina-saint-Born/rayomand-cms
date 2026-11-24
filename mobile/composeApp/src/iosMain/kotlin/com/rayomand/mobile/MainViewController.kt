package com.rayomand.mobile

import androidx.compose.ui.window.ComposeUIViewController
import com.rayomand.mobile.shared.AppViewModel
import com.rayomand.mobile.shared.SessionStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import platform.UIKit.UIViewController

// iOS entry point. The SwiftUI host calls `MainViewControllerKt.MainViewController()`
// and embeds the returned controller. The shared AppViewModel does the work, so
// the same logic runs on both platforms.

private val iosScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

fun MainViewController(): UIViewController {
    val vm = AppViewModel(SessionStore(), iosScope, platform = "ios")
    return ComposeUIViewController { RayomandApp2(vm) }
}
