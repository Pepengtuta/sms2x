package com.ssmmss.gateway.service

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.ContactsContract
import android.provider.Telephony
import android.util.Log
import androidx.core.content.ContextCompat

data class InboundSms(
    val androidSmsId: String,
    val from: String,
    val body: String,
    val timestamp: Long,
    val subscriptionId: Int?,
    val contactName: String?,
)

/**
 * Watches Android's SMS store via ContentObserver (modeled after NectarLink's PhoneSms)
 * and reads new inbound messages for syncing to the ssmmss API.
 */
class SmsInboxReader(context: Context, private val onChange: () -> Unit) {
    private val context = context.applicationContext
    private val resolver = this.context.contentResolver
    private val handler = Handler(Looper.getMainLooper())
    private var observer: ContentObserver? = null
    private val notify = Runnable { onChange() }

    fun canReadSms(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) ==
            PackageManager.PERMISSION_GRANTED

    private fun canReadContacts(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CONTACTS) ==
            PackageManager.PERMISSION_GRANTED

    fun start() {
        if (observer != null || !canReadSms()) return
        runCatching {
            observer = object : ContentObserver(handler) {
                override fun onChange(selfChange: Boolean) {
                    handler.removeCallbacks(notify)
                    handler.postDelayed(notify, SETTLE_MS)
                }
            }.also { obs ->
                for (uri in WATCHED_URIS) {
                    resolver.registerContentObserver(Uri.parse(uri), true, obs)
                }
            }
        }.onFailure {
            stop()
            Log.w(TAG, "Failed to register SMS ContentObserver", it)
        }
    }

    fun stop() {
        observer?.let { obs -> runCatching { resolver.unregisterContentObserver(obs) } }
        observer = null
        handler.removeCallbacks(notify)
    }

    fun readSince(sinceTimestamp: Long, limit: Int = 50): List<InboundSms> {
        if (!canReadSms()) return emptyList()
        val effectiveSince = if (sinceTimestamp > 0L) {
            sinceTimestamp
        } else {
            // Backfill at most 7 days when inbound sync is first enabled.
            System.currentTimeMillis() - SEVEN_DAYS_MS
        }

        val contactsCache = mutableMapOf<String, String?>()
        val projection = arrayOf(
            Telephony.Sms._ID,
            Telephony.Sms.ADDRESS,
            Telephony.Sms.BODY,
            Telephony.Sms.DATE,
            Telephony.Sms.SUBSCRIPTION_ID,
        )
        val selection = "${Telephony.Sms.TYPE} = ? AND ${Telephony.Sms.DATE} > ?"
        val selectionArgs = arrayOf(
            Telephony.Sms.MESSAGE_TYPE_INBOX.toString(),
            effectiveSince.toString(),
        )
        val sortOrder = "${Telephony.Sms.DATE} ASC LIMIT $limit"

        return runCatching {
            resolver.query(Telephony.Sms.CONTENT_URI, projection, selection, selectionArgs, sortOrder)?.use { c ->
                val list = mutableListOf<InboundSms>()
                while (c.moveToNext()) {
                    val id = c.getLong(0).toString()
                    val from = c.getString(1)?.trim().orEmpty()
                    val body = c.getString(2).orEmpty()
                    val date = c.getLong(3)
                    val subId = if (c.isNull(4)) null else c.getInt(4)
                    if (from.isEmpty() || body.isEmpty()) continue
                    val contactName = contactsCache.getOrPut(from) { lookupContactName(from) }
                    list.add(InboundSms(id, from, body, date, subId, contactName))
                }
                list
            }
        }.getOrElse {
            Log.w(TAG, "Failed to query inbound SMS", it)
            emptyList()
        }.orEmpty()
    }

    private fun lookupContactName(number: String): String? {
        if (!canReadContacts() || number.isBlank()) return null
        val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
        return runCatching {
            resolver.query(uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getString(0)?.takeIf { it.isNotBlank() } else null
            }
        }.getOrNull()
    }

    companion object {
        private const val TAG = "SmsInboxReader"
        private const val SETTLE_MS = 500L
        private const val SEVEN_DAYS_MS = 7L * 24 * 60 * 60 * 1000
        private val WATCHED_URIS = listOf(
            "content://mms-sms/",
            "content://sms",
            "content://mms",
        )
    }
}

