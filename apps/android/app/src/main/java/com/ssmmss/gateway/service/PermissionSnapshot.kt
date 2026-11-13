package com.ssmmss.gateway.service

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat

/**
 * Reports the permissions that decide whether this phone can act as a gateway.
 *
 * The foreground service has no Activity, so "denied" and "blocked" cannot be
 * told apart here — the dashboard only needs to know whether it is granted.
 */
object PermissionSnapshot {
    fun snapshot(context: Context): Map<String, String> = mapOf(
        "sms" to state(context, Manifest.permission.SEND_SMS),
        "phoneState" to state(context, Manifest.permission.READ_PHONE_STATE),
        "notifications" to if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            "granted"
        } else {
            state(context, Manifest.permission.POST_NOTIFICATIONS)
        },
        "foregroundService" to "granted",
        "batteryOptimization" to batteryOptimization(context),
    )

    private fun state(context: Context, permission: String): String =
        if (ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED) {
            "granted"
        } else {
            "denied"
        }

    /** Aggressive OEM battery managers kill background work unless this is allowed. */
    private fun batteryOptimization(context: Context): String {
        val power = context.getSystemService(PowerManager::class.java)
        return if (power?.isIgnoringBatteryOptimizations(context.packageName) == true) "granted" else "denied"
    }
}
