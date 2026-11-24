package com.rayomand.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.rayomand.mobile.shared.AppViewModel
import com.rayomand.mobile.shared.SessionStore
import androidx.lifecycle.lifecycleScope

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val store = SessionStore()
        val vm = AppViewModel(store, lifecycleScope, platform = "android")
        setContent {
            RayomandApp2(vm)
        }
    }
}
