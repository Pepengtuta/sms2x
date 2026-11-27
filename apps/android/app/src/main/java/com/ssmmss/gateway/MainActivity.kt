package com.ssmmss.gateway

import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.ssmmss.gateway.data.SettingsStore
import com.ssmmss.gateway.network.ApiClient
import com.ssmmss.gateway.network.Discovery
import com.ssmmss.gateway.network.PairingClient
import com.ssmmss.gateway.service.GatewayForegroundService
import com.ssmmss.gateway.service.SimInfo
import com.ssmmss.gateway.service.SmsSender
import com.ssmmss.gateway.ui.Ink
import com.ssmmss.gateway.ui.Paper
import com.ssmmss.gateway.ui.QrScannerScreen
import com.ssmmss.gateway.ui.SettingsScreen
import com.ssmmss.gateway.ui.StatusScreen
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val store by lazy { SettingsStore(this) }
    private var running by mutableStateOf(false)
    private var sims by mutableStateOf<List<SimInfo>>(emptyList())
    private var tab by mutableStateOf(0)
    private var scanning by mutableStateOf(false)
    private var baseUrl by mutableStateOf("")
    private var deviceName by mutableStateOf("")
    private var pairingToken by mutableStateOf("")
    private var syncInboundSms by mutableStateOf(false)
    private var statusMessage by mutableStateOf<String?>(null)

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            refreshSims()
            if (!hasCameraPermission() && scanning) {
                statusMessage = "Camera permission is required to scan a QR code"
            }
        }

    private val cameraPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                scanning = true
            } else {
                statusMessage = "Camera permission denied. Enter the pairing token manually."
            }
        }

    private fun hasCameraPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA) ==
            android.content.pm.PackageManager.PERMISSION_GRANTED

    private fun requestCameraPermission() {
        cameraPermissionLauncher.launch(android.Manifest.permission.CAMERA)
    }

    private val requiredPermissions: Array<String> = buildList {
        add(android.Manifest.permission.SEND_SMS)
        add(android.Manifest.permission.READ_PHONE_STATE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(android.Manifest.permission.POST_NOTIFICATIONS)
        }
    }.toTypedArray()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Android 15+ enforces edge-to-edge, so the app draws behind the system
        // bars. Make that explicit and give the bars matching icon colours.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(
                android.graphics.Color.TRANSPARENT,
                android.graphics.Color.TRANSPARENT,
            ),
        )

        baseUrl = store.baseUrl
        deviceName = store.deviceName.ifBlank { android.os.Build.MODEL }
        syncInboundSms = store.syncInboundSms
        running = store.enabled && store.isPaired

        requestPermissions()
        refreshSims()
        handlePairingIntent(intent)
        if (!store.isPaired) findServer(silent = true)

        setContent {
            MaterialTheme {
                if (scanning) {
                    QrScannerScreen(
                        onScanned = ::onQrScanned,
                        onCancel = { scanning = false },
                    )
                    return@MaterialTheme
                }
                Column(Modifier.fillMaxSize().background(Paper)) {
                    Tabs()
                    when (tab) {
                        0 -> StatusScreen(
                            running = running,
                            deviceName = deviceName,
                            deviceId = store.deviceId,
                            baseUrl = baseUrl,
                            sims = sims,
                            onToggle = ::toggleService,
                        )
                        else -> SettingsScreen(
                            baseUrl = baseUrl,
                            deviceName = deviceName,
                            pairingToken = pairingToken,
                            syncInboundSms = syncInboundSms,
                            onBaseUrlChange = {
                                baseUrl = it
                                store.baseUrl = it
                            },
                            onDeviceNameChange = {
                                deviceName = it
                                store.deviceName = it
                            },
                            onPairingTokenChange = { pairingToken = it },
                            onSyncInboundSmsChange = ::toggleInboundSync,
                            onPair = ::pairDevice,
                            onUnpair = ::unpairDevice,
                            onScan = ::openScanner,
                            onFindServer = { findServer(silent = false) },
                            isPaired = store.isPaired,
                            statusMessage = statusMessage,
                        )
                    }
                }
            }
        }
    }

    private fun toggleInboundSync(enable: Boolean) {
        syncInboundSms = enable
        store.syncInboundSms = enable
        if (enable) {
            permissionLauncher.launch(
                arrayOf(
                    android.Manifest.permission.READ_SMS,
                    android.Manifest.permission.READ_CONTACTS,
                ),
            )
        }
        if (running) {
            stopService(Intent(this, GatewayForegroundService::class.java))
            ContextCompat.startForegroundService(this, Intent(this, GatewayForegroundService::class.java))
        }
    }

    private fun openScanner() {
        if (!hasCameraPermission()) {
            requestCameraPermission()
            return
        }
        scanning = true
    }

    /**
     * Broadcasts on the LAN to find the API. Picks the first candidate that
     * answers /health, so the app works on any phone without typing an IP.
     */
    private fun findServer(silent: Boolean) {
        if (!silent) statusMessage = "Searching for a ssmmss server on this network..."
        lifecycleScope.launch(Dispatchers.IO) {
            val candidates = Discovery.discover()
            val reachable = candidates.firstOrNull { url -> ping(url) }
            runOnUiThread {
                if (reachable != null) {
                    baseUrl = reachable
                    store.baseUrl = reachable
                    statusMessage = "Found ssmmss server at $reachable"
                } else if (!silent) {
                    statusMessage = "No ssmmss server found on this network. Enter the Server URL manually."
                }
            }
        }
    }

    /** True when the URL answers the health endpoint. */
    private fun ping(url: String): Boolean = try {
        val connection = (java.net.URL("$url/health").openConnection() as java.net.HttpURLConnection).apply {
            connectTimeout = 2500
            readTimeout = 2500
            requestMethod = "GET"
        }
        try {
            connection.responseCode == 200
        } finally {
            connection.disconnect()
        }
    } catch (_: Exception) {
        false
    }

    private fun onQrScanned(text: String) {
        scanning = false
        val parsed = parsePairingPayload(text)
        if (parsed == null) {
            statusMessage = "That QR code is not a pairing code"
            return
        }
        parsed.second?.let {
            baseUrl = it
            store.baseUrl = it
        }
        pairingToken = parsed.first
        tab = 1
        pairDevice()
    }

    /** Accepts ssmmss://pair?token=..&url=.. and a bare token. */
    private fun parsePairingPayload(text: String): Pair<String, String?>? {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return null
        if (!trimmed.startsWith("ssmmss://")) {
            // A bare token is fine too.
            return if (trimmed.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }) {
                trimmed to null
            } else {
                null
            }
        }
        val uri = android.net.Uri.parse(trimmed)
        val token = uri.getQueryParameter("token")?.trim().orEmpty()
        if (token.isEmpty()) return null
        return token to uri.getQueryParameter("url")?.trim()?.takeIf { it.isNotEmpty() }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handlePairingIntent(intent)
    }

    /** Handles ssmmss://pair?token=...&url=... links opened by the phone's camera. */
    private fun handlePairingIntent(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "ssmmss") return

        val token = data.getQueryParameter("token")?.trim().orEmpty()
        val url = data.getQueryParameter("url")?.trim().orEmpty()

        if (url.isNotBlank()) {
            baseUrl = url
            store.baseUrl = url
        }
        if (token.isNotBlank()) {
            pairingToken = token
            tab = 1
            pairDevice()
        }
    }

    @Composable
    private fun Tabs() {
        Row(
            Modifier
                .fillMaxWidth()
                .background(Ink)
                // Dark bar extends behind the status bar; its content sits below.
                .statusBarsPadding()
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "SSMMSS",
                fontSize = 12.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                letterSpacing = 2.sp,
                fontFamily = FontFamily.Monospace,
                color = Paper,
            )
            Spacer(Modifier.weight(1f))
            listOf("STATUS", "SETTINGS").forEachIndexed { index, label ->
                val selected = tab == index
                Text(
                    text = label,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    color = if (selected) Ink else Paper,
                    modifier = Modifier
                        .clickable { tab = index }
                        .background(if (selected) Paper else androidx.compose.ui.graphics.Color.Transparent)
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                )
                Spacer(Modifier.width(6.dp))
            }
        }
    }

    private fun requestPermissions() {
        val missing = requiredPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != android.content.pm.PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) permissionLauncher.launch(missing.toTypedArray())
    }

    private fun refreshSims() {
        sims = SmsSender(this).getActiveSimCards()
    }

    private fun toggleService(enable: Boolean) {
        store.enabled = enable
        running = enable
        val intent = android.content.Intent(this, GatewayForegroundService::class.java)
        if (enable) {
            ContextCompat.startForegroundService(this, intent)
        } else {
            stopService(intent)
        }
    }

    private fun pairDevice() {
        val token = pairingToken.trim()
        if (token.isBlank()) {
            statusMessage = "Enter a pairing token or scan the QR code first"
            return
        }
        statusMessage = "Pairing..."
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val (deviceToken, deviceId) = PairingClient.pair(
                    baseUrl,
                    token,
                    deviceName,
                    store.deviceIdentifier,
                )
                store.deviceToken = deviceToken
                store.deviceId = deviceId
                store.deviceName = deviceName
                runOnUiThread { statusMessage = "Paired as $deviceName" }
            } catch (e: Exception) {
                runOnUiThread { statusMessage = describePairingFailure(e) }
            }
        }
    }

    /** Turns a raw network error into something the user can act on. */
    private fun describePairingFailure(error: Exception): String {
        val message = error.message.orEmpty()
        return when {
            message.contains("Failed to connect", ignoreCase = true) ||
                message.contains("ECONNREFUSED", ignoreCase = true) ||
                message.contains("timed out", ignoreCase = true) ->
                "Cannot reach $baseUrl. Check the API is running and that this is the PC's " +
                    "LAN address (not 10.0.2.2, which is emulator-only)."
            message.contains("401") || message.contains("invalid or expired", ignoreCase = true) ->
                "Pairing token rejected. Generate a fresh one on the dashboard."
            else -> "Pairing failed: $message"
        }
    }

    private fun unpairDevice() {
        // Tell the server first so the device is actually released. If that
        // fails the local token still goes, but the dashboard will keep showing
        // the device until it stops heartbeating — so say so.
        val token = store.deviceToken
        var serverReached = false
        if (token.isNotBlank()) {
            lifecycleScope.launch(Dispatchers.IO) {
                serverReached = try {
                    ApiClient(baseUrl, token).unpair()
                    true
                } catch (e: Exception) {
                    false
                }
                runOnUiThread {
                    finishUnpair(serverReached)
                }
            }
        } else {
            finishUnpair(false)
        }
    }

    private fun finishUnpair(serverReached: Boolean) {
        store.clearPairing()
        store.enabled = false
        running = false
        stopService(android.content.Intent(this, GatewayForegroundService::class.java))
        statusMessage = if (serverReached) {
            "Device unpaired"
        } else {
            "Unpaired locally, but the server was unreachable — this device will show as offline until it stops heartbeating"
        }
    }
}
