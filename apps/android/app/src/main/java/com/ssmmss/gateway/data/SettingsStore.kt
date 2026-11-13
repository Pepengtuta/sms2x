package com.ssmmss.gateway.data

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

data class GatewayConfig(
    val baseUrl: String,
    val deviceToken: String,
    val deviceId: String,
    val deviceName: String,
)

class SettingsStore(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("gateway_settings", Context.MODE_PRIVATE)

    var baseUrl: String
        get() = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL
        set(value) = prefs.edit().putString(KEY_BASE_URL, value.trim().trimEnd('/')).apply()

    var deviceToken: String
        get() = prefs.getString(KEY_DEVICE_TOKEN, "") ?: ""
        set(value) = prefs.edit().putString(KEY_DEVICE_TOKEN, value.trim()).apply()

    var deviceId: String
        get() = prefs.getString(KEY_DEVICE_ID, "") ?: ""
        set(value) = prefs.edit().putString(KEY_DEVICE_ID, value.trim()).apply()

    var deviceName: String
        get() = prefs.getString(KEY_DEVICE_NAME, "") ?: ""
        set(value) = prefs.edit().putString(KEY_DEVICE_NAME, value.trim()).apply()

    var enabled: Boolean
        get() = prefs.getBoolean(KEY_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_ENABLED, value).apply()

    /**
     * Stable identifier for this physical phone. Generated once and kept across
     * re-pairing, so the server can tell it is the same device and revoke the
     * previous owner's access.
     */
    val deviceIdentifier: String
        get() {
            val existing = prefs.getString(KEY_DEVICE_IDENTIFIER, null)
            if (!existing.isNullOrBlank()) return existing
            val generated = UUID.randomUUID().toString()
            prefs.edit().putString(KEY_DEVICE_IDENTIFIER, generated).apply()
            return generated
        }

    val isPaired: Boolean get() = deviceToken.isNotBlank() && deviceId.isNotBlank()

    fun config(): GatewayConfig? {
        if (!isPaired) return null
        return GatewayConfig(baseUrl, deviceToken, deviceId, deviceName)
    }

    fun clearPairing() {
        prefs.edit().remove(KEY_DEVICE_TOKEN).remove(KEY_DEVICE_ID).apply()
    }

    companion object {
        private const val KEY_BASE_URL = "base_url"
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_DEVICE_NAME = "device_name"
        private const val KEY_DEVICE_IDENTIFIER = "device_identifier"
        private const val KEY_ENABLED = "enabled"

        // 10.0.2.2 only reaches the host from an Android emulator. On a real
        // phone the user must enter the PC's LAN address, or scan the QR code
        // which carries it.
        const val DEFAULT_BASE_URL = "http://10.0.2.2:3000"
    }
}
