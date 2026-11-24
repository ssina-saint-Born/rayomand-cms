# Keep Kotlin serialization metadata for the API models.
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class com.rayomand.mobile.shared.** { *; }
-keep class kotlinx.serialization.** { *; }
-dontwarn kotlinx.serialization.**
