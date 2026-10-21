package com.ttokapp.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

@CapacitorPlugin(name = "ProblemOcr")
public class ProblemOcrPlugin extends Plugin {
    @PluginMethod
    public void recognize(PluginCall call) {
        String base64 = call.getString("base64");
        if (base64 == null || base64.length() > 12_000_000) {
            call.reject("Invalid image");
            return;
        }
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) {
                call.reject("Unreadable image");
                return;
            }
            InputImage image = InputImage.fromBitmap(bitmap, 0);
            TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).process(image)
                .addOnSuccessListener(result -> {
                    JSObject data = new JSObject();
                    data.put("text", result.getText());
                    call.resolve(data);
                    bitmap.recycle();
                })
                .addOnFailureListener(error -> {
                    call.reject("OCR failed", error);
                    bitmap.recycle();
                });
        } catch (Exception error) {
            call.reject("OCR failed", error);
        }
    }
}
