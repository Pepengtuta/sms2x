package com.ssmmss.gateway.network

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException
import org.json.JSONObject

/**
 * Finds the ssmmss API on the local network by UDP broadcast, so the app works
 * on any phone without the user typing an IP address.
 */
object Discovery {
    private const val PORT = 41234
    private const val MAGIC = "ssmmss-discovery"

    /** Broadcasts a discovery request and returns the URLs that answered. */
    fun discover(timeoutMs: Long = 2500): List<String> {
        val found = mutableListOf<String>()
        try {
            DatagramSocket().use { socket ->
                socket.broadcast = true
                socket.soTimeout = 400

                val request = MAGIC.toByteArray()
                socket.send(
                    DatagramPacket(request, request.size, InetAddress.getByName("255.255.255.255"), PORT)
                )

                val buffer = ByteArray(1024)
                val deadline = System.currentTimeMillis() + timeoutMs
                while (System.currentTimeMillis() < deadline) {
                    val packet = DatagramPacket(buffer, buffer.size)
                    try {
                        socket.receive(packet)
                    } catch (_: SocketTimeoutException) {
                        continue
                    }
                    val text = String(packet.data, 0, packet.length)
                    val url = extractUrl(text)
                    if (url != null && !found.contains(url)) {
                        found.add(url)
                    }
                }
            }
        } catch (_: Exception) {
            // No network or the broadcast was blocked — the user can still type a URL.
        }
        return found
    }

    private fun extractUrl(payload: String): String? {
        return try {
            val url = JSONObject(payload).optString("url")
            if (url.isNullOrBlank()) null else url.trimEnd('/')
        } catch (_: Exception) {
            null
        }
    }
}
