package com.ssmmss.gateway.service

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import androidx.core.content.ContextCompat

data class SimInfo(
    val subscriptionId: Int,
    val slotIndex: Int,
    val carrierName: String,
    val phoneNumber: String?,
)

/** A structured failure the dashboard can group by. */
data class SmsFailure(val reason: String, val message: String)

object FailureReasons {
    const val NO_SIGNAL = "NO_SIGNAL"
    const val SEND_FAILED = "SEND_FAILED"
    const val NO_SIM = "NO_SIM"
    const val PERMISSION_DENIED = "PERMISSION_DENIED"
    const val INVALID_NUMBER = "INVALID_NUMBER"
    const val UNKNOWN = "UNKNOWN"

    /** Android's SmsManager radio result codes. */
    fun fromRadioCode(code: Int): String = when (code) {
        1, 4 -> NO_SIGNAL            // RADIO_OFF, NO_SERVICE
        2, 3, 5, 6, 7, 8 -> SEND_FAILED // GENERIC_FAILURE, NULL_PDU, LIMIT_EXCEEDED,
                                         // FDN_CHECK_FAILURE, SHORT_CODE_*
        else -> UNKNOWN
    }
}

class SmsSender(private val context: Context) {

    fun getActiveSimCards(): List<SimInfo> {
        val subManager = context.getSystemService(SubscriptionManager::class.java) ?: return emptyList()
        return try {
            val list = subManager.activeSubscriptionInfoList ?: emptyList()
            list.map { sub ->
                SimInfo(
                    subscriptionId = sub.subscriptionId,
                    slotIndex = sub.simSlotIndex,
                    carrierName = sub.carrierName?.toString() ?: "Unknown",
                    phoneNumber = sub.number
                )
            }
        } catch (e: SecurityException) {
            emptyList()
        }
    }

    fun sendSms(
        destination: String,
        body: String,
        subscriptionId: Int,
        onResult: (success: Boolean, failure: SmsFailure?) -> Unit
    ) {
        val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(SmsManager::class.java)?.createForSubscriptionId(subscriptionId)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
        } ?: run {
            onResult(
                false,
                SmsFailure(FailureReasons.NO_SIM, "SmsManager unavailable for subscription $subscriptionId")
            )
            return
        }

        val action = "com.ssmmss.gateway.SMS_SENT_${System.currentTimeMillis()}"
        val sentIntent = PendingIntent.getBroadcast(
            context,
            0,
            Intent(action),
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
        )

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                try {
                    context.unregisterReceiver(this)
                } catch (_: IllegalArgumentException) {
                    // Already unregistered.
                }
                if (resultCode == Activity.RESULT_OK) {
                    onResult(true, null)
                } else {
                    onResult(
                        false,
                        SmsFailure(
                            FailureReasons.fromRadioCode(resultCode),
                            "Send failed with radio code: $resultCode"
                        )
                    )
                }
            }
        }

        // The telephony framework is a privileged sender; RECEIVER_NOT_EXPORTED
        // would not receive its SMS_SENT broadcast on Android 14+.
        ContextCompat.registerReceiver(
            context,
            receiver,
            IntentFilter(action),
            ContextCompat.RECEIVER_EXPORTED
        )

        val parts = smsManager.divideMessage(body)
        if (parts.size > 1) {
            val intents = ArrayList<PendingIntent>().apply { add(sentIntent) }
            while (intents.size < parts.size) intents.add(sentIntent)
            smsManager.sendMultipartTextMessage(destination, null, parts, intents, null)
        } else {
            smsManager.sendTextMessage(destination, null, body, sentIntent, null)
        }
    }
}
