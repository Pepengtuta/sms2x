package com.ssmmss.gateway.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.content.ContextCompat
import com.ssmmss.gateway.data.SettingsStore
import com.ssmmss.gateway.network.ApiClient
import com.ssmmss.gateway.network.ApiException
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class GatewayForegroundService : Service() {

    /** Heartbeat and polling run on separate threads so a slow request cannot starve the other. */
    private val heartbeatExecutor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private val pollExecutor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private var started = false

    override fun onCreate() {
        super.onCreate()
        createChannel()
        startForeground(NOTIFICATION_ID, notification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val store = SettingsStore(this)
        val config = store.config()
        if (config == null || !store.enabled) {
            stopSelf()
            return START_NOT_STICKY
        }

        // onStartCommand runs on every start; schedule the loops exactly once.
        if (started) return START_STICKY
        started = true

        val client = ApiClient(config.baseUrl, config.deviceToken)
        val sender = SmsSender(this)

        heartbeatExecutor.scheduleWithFixedDelay({
            try {
                client.heartbeat(
                    sender.getActiveSimCards(),
                    Build.VERSION.RELEASE,
                    true,
                    PermissionSnapshot.snapshot(this),
                )
            } catch (e: ApiException) {
                Log.w(TAG, "heartbeat rejected: ${e.status}", e)
                // The device token is no longer valid (unpaired or revoked).
                if (e.status == 401) {
                    stopRuntime()
                    return@scheduleWithFixedDelay
                }
            } catch (e: Exception) {
                Log.w(TAG, "heartbeat failed", e)
            }
        }, 0, HEARTBEAT_SECONDS, TimeUnit.SECONDS)

        pollExecutor.scheduleWithFixedDelay({
            try {
                drainOne(client, sender)
            } catch (e: ApiException) {
                Log.w(TAG, "poll rejected: ${e.status}", e)
                if (e.status == 401) {
                    stopRuntime()
                    return@scheduleWithFixedDelay
                }
            } catch (e: Exception) {
                Log.w(TAG, "poll failed", e)
            }
        }, 0, POLL_SECONDS, TimeUnit.SECONDS)

        return START_STICKY
    }

    /** Claims at most one message per tick and reports its outcome. */
    private fun drainOne(client: ApiClient, sender: SmsSender) {
        val message = client.poll() ?: return
        val subscriptionId = message.subscriptionId
        if (subscriptionId == null) {
            client.reportStatus(
                message.id,
                "failed",
                SmsFailure(FailureReasons.NO_SIM, "No SIM slot assigned to this message")
            )
            return
        }

        if (!hasSendPermission()) {
            client.reportStatus(
                message.id,
                "failed",
                SmsFailure(FailureReasons.PERMISSION_DENIED, "Send SMS permission is not granted")
            )
            return
        }

        if (!E164.matches(message.to)) {
            client.reportStatus(
                message.id,
                "failed",
                SmsFailure(FailureReasons.INVALID_NUMBER, "Recipient is not a valid E.164 number")
            )
            return
        }

        sender.sendSms(message.to, message.body, subscriptionId) { success, failure ->
            // The broadcast receiver runs on the main thread; network calls must not.
            try {
                pollExecutor.execute {
                    try {
                        if (success) {
                            client.reportStatus(message.id, "sent")
                        } else {
                            client.reportStatus(message.id, "failed", failure)
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "status report failed", e)
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "service already stopped", e)
            }
        }
    }

    private fun hasSendPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, android.Manifest.permission.SEND_SMS) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED

    private fun stopRuntime() {
        SettingsStore(this).enabled = false
        stopSelf()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        heartbeatExecutor.shutdownNow()
        pollExecutor.shutdownNow()
        super.onDestroy()
    }

    private fun notification(): Notification {
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return builder
            .setContentTitle("ssmmss gateway")
            .setContentText("Connected and polling for messages")
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setOngoing(true)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "SMS gateway", NotificationManager.IMPORTANCE_LOW),
            )
        }
    }

    companion object {
        const val CHANNEL_ID = "gateway-service"
        const val NOTIFICATION_ID = 1001
        private const val HEARTBEAT_SECONDS = 30L
        private const val POLL_SECONDS = 5L
        private const val TAG = "GatewayService"
        private val E164 = Regex("\\+[0-9]{8,15}")
    }
}
