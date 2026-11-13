package com.ssmmss.gateway.network

import org.json.JSONObject
import com.ssmmss.gateway.service.SimInfo
import com.ssmmss.gateway.service.SmsFailure
import java.net.HttpURLConnection
import java.net.URL

data class GatewayMessage(
    val id: String,
    val to: String,
    val body: String,
    val subscriptionId: Int?,
)

class ApiException(val status: Int, message: String) : Exception(message)

class ApiClient(
    private val baseUrl: String,
    private val deviceToken: String,
) {
    private fun endpoint(path: String) = "${baseUrl.trimEnd('/')}$path"

    private fun request(method: String, path: String, body: JSONObject? = null): String {
        val conn = (URL(endpoint(path)).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 20_000
            setRequestProperty("Authorization", "Bearer $deviceToken")
            setRequestProperty("Accept", "application/json")
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }
        try {
            if (body != null) conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val status = conn.responseCode
            val text = (if (status in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: ""
            if (status !in 200..299) {
                throw ApiException(status, "HTTP $status: $text")
            }
            return text
        } finally {
            conn.disconnect()
        }
    }

    fun heartbeat(
        sims: List<SimInfo>,
        androidVersion: String,
        serviceRunning: Boolean,
        permissions: Map<String, String>,
    ): Boolean {
        val payload = JSONObject().put("status", "online")
        val array = org.json.JSONArray()
        sims.forEach {
            array.put(
                JSONObject()
                    .put("subscriptionId", it.subscriptionId)
                    .put("slotIndex", it.slotIndex)
                    .put("carrierName", it.carrierName)
                    .put("phoneNumber", it.phoneNumber ?: "")
            )
        }
        payload.put("sims", array)
        payload.put("androidVersion", androidVersion)
        payload.put("serviceRunning", serviceRunning)
        val perms = JSONObject()
        permissions.forEach { (key, value) -> perms.put(key, value) }
        payload.put("permissions", perms)
        request("POST", "/gateway/heartbeat", payload)
        return true
    }

    /** Returns null when there is no queued message. */
    fun poll(): GatewayMessage? {
        val text = request("GET", "/gateway/poll")
        val message = JSONObject(text).optJSONObject("message") ?: return null
        return GatewayMessage(
            id = message.getString("id"),
            to = message.getString("to"),
            body = message.getString("body"),
            subscriptionId = if (message.isNull("subscriptionId")) null else message.getInt("subscriptionId"),
        )
    }

    fun reportStatus(messageId: String, status: String, failure: SmsFailure? = null) {
        val payload = JSONObject().put("status", status)
        if (failure != null) {
            payload.put("error", failure.message)
            payload.put("failureReason", failure.reason)
        }
        request("POST", "/gateway/messages/$messageId/status", payload)
    }

    /** Releases this phone from the account so its token stops working. */
    fun unpair() {
        request("POST", "/gateway/unpair")
    }
}

/** Pairs this phone with a user account using the short-lived token from the dashboard. */
object PairingClient {
    fun pair(
        baseUrl: String,
        pairingToken: String,
        deviceName: String,
        deviceIdentifier: String,
    ): Pair<String, String> {
        val payload = JSONObject()
            .put("pairingToken", pairingToken)
            .put("deviceName", deviceName)
            .put("deviceIdentifier", deviceIdentifier)
        val conn = (URL("${baseUrl.trimEnd('/')}/gateway/pair").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 10_000
            readTimeout = 20_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
        try {
            conn.outputStream.use { it.write(payload.toString().toByteArray()) }
            val status = conn.responseCode
            val text = (if (status in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: ""
            if (status !in 200..299) throw ApiException(status, "HTTP $status: $text")
            val json = JSONObject(text)
            return json.getString("deviceToken") to json.getString("deviceId")
        } finally {
            conn.disconnect()
        }
    }
}
