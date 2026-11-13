package com.ssmmss.gateway.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val Ink = Color(0xFF0A0A0A)
val Paper = Color(0xFFFFFFFF)
val Muted = Color(0xFF737373)
val Hairline = Color(0xFFE5E5E5)

@Composable
fun SectionTitle(text: String) {
    Text(
        text = text,
        fontSize = 13.sp,
        fontWeight = FontWeight.Bold,
        letterSpacing = 2.sp,
        fontFamily = FontFamily.Monospace,
        color = Ink,
    )
}

@Composable
fun Label(text: String) {
    Text(
        text = text,
        fontSize = 11.sp,
        fontFamily = FontFamily.Monospace,
        color = Muted,
    )
}

@Composable
fun MonoText(text: String, size: Int = 13, bold: Boolean = false) {
    Text(
        text = text,
        fontSize = size.sp,
        fontFamily = FontFamily.Monospace,
        fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal,
        color = Ink,
    )
}

@Composable
fun Badge(text: String) {
    Text(
        text = "[ $text ]",
        fontSize = 11.sp,
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Bold,
        color = Ink,
        modifier = Modifier
            .border(1.dp, Ink, RoundedCornerShape(2.dp))
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

@Composable
fun PlainButton(
    text: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier,
        shape = RoundedCornerShape(0.dp),
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = Ink,
            disabledContentColor = Muted,
        ),
    ) {
        Text(text = text, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
    }
}

@Composable
fun SolidButton(
    text: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
    modifier: Modifier = Modifier,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier,
        shape = RoundedCornerShape(0.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Ink,
            contentColor = Paper,
            disabledContainerColor = Muted,
            disabledContentColor = Paper,
        ),
    ) {
        Text(text = text, fontSize = 12.sp, fontFamily = FontFamily.Monospace)
    }
}

@Composable
fun MonoField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label, fontSize = 11.sp, fontFamily = FontFamily.Monospace) },
        singleLine = singleLine,
        textStyle = androidx.compose.ui.text.TextStyle(
            fontSize = 13.sp,
            fontFamily = FontFamily.Monospace,
            color = Ink,
        ),
        shape = RoundedCornerShape(0.dp),
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
fun Card(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier = modifier
            .border(1.dp, Ink, RoundedCornerShape(0.dp))
            .padding(16.dp),
    ) { content() }
}

@Composable
fun RowOf(vararg items: @Composable () -> Unit) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) { items.forEach { it() } }
}

@Composable
fun Gap(height: Int = 12) {
    Spacer(Modifier.height(height.dp))
}

@Composable
fun Screen(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .background(Paper)
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            // Keep the scrollable content clear of the gesture/navigation bar.
            .navigationBarsPadding()
            .padding(20.dp),
    ) { content() }
}

@Composable
fun ClickableRow(onClick: () -> Unit, content: @Composable () -> Unit) {
    Column(modifier = Modifier.clickable { onClick() }) { content() }
}
