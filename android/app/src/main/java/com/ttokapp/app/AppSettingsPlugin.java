package com.ttokapp.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.MessageDigest;

@CapacitorPlugin(name = "AppSettings")
public class AppSettingsPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not open settings", e);
        }
    }

    /**
     * Reports which package/version/signing certificate this install is actually
     * running as - Google Sign-In's "error 10" (DEVELOPER_ERROR) is a mismatch between
     * exactly these values and the OAuth clients registered in Firebase/Google Cloud,
     * and which signing key a Play-distributed install ends up with isn't visible
     * anywhere on the device otherwise.
     */
    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageManager pm = ctx.getPackageManager();
            String pkg = ctx.getPackageName();
            JSObject ret = new JSObject();
            JSArray sha1s = new JSArray();
            PackageInfo pi;
            Signature[] signers;

            if (Build.VERSION.SDK_INT >= 28) {
                pi = pm.getPackageInfo(pkg, PackageManager.GET_SIGNING_CERTIFICATES);
                signers = pi.signingInfo.getApkContentsSigners();
                ret.put("versionCode", pi.getLongVersionCode());
            } else {
                pi = pm.getPackageInfo(pkg, PackageManager.GET_SIGNATURES);
                signers = pi.signatures;
                ret.put("versionCode", pi.versionCode);
            }

            for (Signature sig : signers) {
                byte[] digest = MessageDigest.getInstance("SHA-1").digest(sig.toByteArray());
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < digest.length; i++) {
                    if (i > 0) sb.append(':');
                    sb.append(String.format("%02X", digest[i]));
                }
                sha1s.put(sb.toString());
            }

            String installer;
            if (Build.VERSION.SDK_INT >= 30) {
                installer = pm.getInstallSourceInfo(pkg).getInstallingPackageName();
            } else {
                installer = pm.getInstallerPackageName(pkg);
            }

            ret.put("packageName", pkg);
            ret.put("versionName", pi.versionName);
            ret.put("signingSha1", sha1s);
            ret.put("installer", installer == null ? "none" : installer);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read app info", e);
        }
    }
}
