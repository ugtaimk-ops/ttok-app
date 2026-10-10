# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Preserve useful crash locations in the mapping file.
-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Capacitor uses these runtime annotations to register plugins and to resolve
# permissions (including LocalNotifications.checkPermissions). An earlier R8
# release crashed in Bridge.getPermissionStates, so retain metadata and methods
# involved in this reflection path.
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault,InnerClasses,EnclosingMethod,Signature
-keep class com.getcapacitor.annotation.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class com.capacitorjs.plugins.localnotifications.LocalNotificationsPlugin { *; }

# FirebaseAuthentication is configured for Google only. Its optional Facebook
# handler is compiled against Facebook SDK types but that SDK is intentionally
# absent from this app. R8 may safely discard the unused handler.
-dontwarn com.facebook.CallbackManager$Factory
-dontwarn com.facebook.CallbackManager
-dontwarn com.facebook.FacebookCallback
-dontwarn com.facebook.login.LoginManager
-dontwarn com.facebook.login.widget.LoginButton
