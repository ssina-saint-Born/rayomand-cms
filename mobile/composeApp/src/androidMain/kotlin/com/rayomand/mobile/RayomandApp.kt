package com.rayomand.mobile

import android.app.Application
import com.rayomand.mobile.shared.initAndroidSettings

class RayomandApp : Application() {
    override fun onCreate() {
        super.onCreate()
        initAndroidSettings(this)
    }
}
