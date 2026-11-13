package com.ssmmss.gateway

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.ssmmss.gateway.data.SettingsStore
import com.ssmmss.gateway.service.GatewayForegroundService

class GatewayBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val store = SettingsStore(context)
        if (!store.enabled || !store.isPaired) return
        ContextCompat.startForegroundService(context, Intent(context, GatewayForegroundService::class.java))
    }
}
