package com.ssmmss.gateway.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.ssmmss.gateway.service.SimInfo

@Composable
fun StatusScreen(
    running: Boolean,
    deviceName: String,
    deviceId: String,
    baseUrl: String,
    sims: List<SimInfo>,
    onToggle: (Boolean) -> Unit,
) {
    Screen {
        SectionTitle("STATUS")
        Gap(16)

        Card(Modifier.fillMaxWidth()) {
            RowOf({
                Badge(if (running) "Online" else "Offline")
            }, {
                MonoText(deviceName.ifBlank { "Unpaired device" }, bold = true)
            })
            Gap(10)
            MonoText("Device ID: ${deviceId.ifBlank { "—" }}")
            Gap(4)
            MonoText("Server: $baseUrl")
        }

        Gap(16)

        SectionTitle("SIM CARDS")
        Gap(8)
        if (sims.isEmpty()) {
            Label("No active SIM detected")
        } else {
            sims.forEach { sim ->
                Card(Modifier.fillMaxWidth()) {
                    RowOf({ MonoText(sim.carrierName, bold = true) }, {
                        Badge("Slot ${sim.slotIndex + 1}")
                    })
                    Gap(6)
                    Label("Subscription ${sim.subscriptionId}")
                    if (!sim.phoneNumber.isNullOrBlank()) {
                        Gap(2)
                        Label(sim.phoneNumber)
                    }
                }
                Gap(8)
            }
        }

        Gap(16)

        if (running) {
            PlainButton("[ Stop Gateway ]", { onToggle(false) }, modifier = Modifier.fillMaxWidth())
        } else {
            SolidButton("[ Start Gateway ]", { onToggle(true) }, modifier = Modifier.fillMaxWidth())
        }
    }
}

@Composable
fun SettingsScreen(
    baseUrl: String,
    deviceName: String,
    pairingToken: String,
    onBaseUrlChange: (String) -> Unit,
    onDeviceNameChange: (String) -> Unit,
    onPairingTokenChange: (String) -> Unit,
    onPair: () -> Unit,
    onUnpair: () -> Unit,
    onScan: () -> Unit,
    onFindServer: () -> Unit,
    isPaired: Boolean,
    statusMessage: String?,
) {
    Screen {
        SectionTitle("SETTINGS")
        Gap(16)

        MonoField(baseUrl, onBaseUrlChange, "Server URL")
        Gap(8)
        PlainButton("[ Find Server On Network ]", onFindServer)
        Gap(16)
        MonoField(deviceName, onDeviceNameChange, "Device name")

        Gap(20)
        SectionTitle("PAIR THIS DEVICE")
        Gap(12)

        // Two ways to pair: scan the dashboard's QR code, or type the token.
        SolidButton("[ Scan QR Code ]", onScan, modifier = Modifier.fillMaxWidth())
        Gap(16)

        Label("Or enter the pairing token manually")
        Gap(6)
        MonoField(pairingToken, onPairingTokenChange, "Pairing token")
        Gap(16)

        if (isPaired) {
            PlainButton("[ Unpair Device ]", onUnpair, modifier = Modifier.fillMaxWidth())
        } else {
            SolidButton("[ Pair Device ]", onPair, modifier = Modifier.fillMaxWidth())
        }

        if (!statusMessage.isNullOrBlank()) {
            Gap(12)
            Label(statusMessage)
        }
    }
}
