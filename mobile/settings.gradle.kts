rootProject.name = "RayomandMobile"

pluginManagement {
    repositories {
        // Google's Maven host is not reachable from every network (it 404s
        // through some corporate proxies). Aliyun mirrors the same artifacts;
        // the local Google repo is tried first when it works.
        maven("https://maven.aliyun.com/repository/google")
        maven("https://maven.aliyun.com/repository/gradle-plugin")
        google()
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        maven("https://maven.aliyun.com/repository/google")
        google()
        mavenCentral()
    }
}

include(":shared")
include(":composeApp")
