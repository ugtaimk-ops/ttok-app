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
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

@CapacitorPlugin(name = "ProblemOcr")
public class ProblemOcrPlugin extends Plugin {
    @PluginMethod
    public void recognize(PluginCall call) {
        String base64 = call.getString("base64");
        if (base64 == null || base64.length() < 100 || base64.length() > 12_000_000) {
            call.reject("Invalid image");
            return;
        }
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0 ||
                (long) bounds.outWidth * bounds.outHeight > 25_000_000L) {
                call.reject("Image dimensions are too large");
                return;
            }
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = 1;
            while (bounds.outWidth / options.inSampleSize > 2400 || bounds.outHeight / options.inSampleSize > 2400) {
                options.inSampleSize *= 2;
            }
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (bitmap == null) {
                call.reject("Unreadable image");
                return;
            }
            InputImage image = InputImage.fromBitmap(bitmap, 0);
            TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            recognizer.process(image)
                .addOnSuccessListener(result -> {
                    JSObject data = new JSObject();
                    data.put("text", result.getText());
                    call.resolve(data);
                })
                .addOnFailureListener(error -> {
                    call.reject("OCR failed", error);
                })
                .addOnCompleteListener(task -> {
                    recognizer.close();
                    bitmap.recycle();
                });
        } catch (OutOfMemoryError error) {
            call.reject("Image is too large");
        } catch (Exception error) {
            call.reject("OCR failed", error);
        }
    }
}
