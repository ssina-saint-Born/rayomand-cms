@file:OptIn(ExperimentalMaterial3Api::class)

package com.rayomand.mobile

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rayomand.mobile.shared.ProjectInfo

// In-app deploy helper: collects a few values, builds the exact multi-step
// command that clones the CMS from the official repository and runs the
// installer, and lets the user copy it to their server. The app does not open
// SSH itself; it produces a command the operator pastes into their own
// terminal, so no server credentials ever pass through the phone.

private enum class InstallMethod(val label: String) {
    Docker("Docker"),
    BareMetal("Bare metal"),
}

@Composable
fun InstallScreen(onBack: () -> Unit) {
    val clipboard = LocalClipboardManager.current
    val uriHandler = LocalUriHandler.current

    var method by remember { mutableStateOf(InstallMethod.Docker) }
    var host by remember { mutableStateOf("") }
    var sshUser by remember { mutableStateOf("root") }
    var installDir by remember { mutableStateOf("/opt/rayomand") }
    var webPort by remember { mutableStateOf("3131") }
    var copied by remember { mutableStateOf(false) }
    val portValid = ProjectInfo.isValidPort(webPort)

    val command = when (method) {
        InstallMethod.Docker -> ProjectInfo.dockerCommand(installDir, webPort, sshUser, host)
        InstallMethod.BareMetal -> ProjectInfo.bareMetalCommand(installDir, webPort, sshUser, host)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Install on your server", fontSize = 16.sp) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                },
            )
        },
    ) { pad ->
        Column(
            Modifier.padding(pad).fillMaxSize().padding(20.dp).verticalScroll(rememberScrollState()),
        ) {
            Text("Deploy Rayomand CMS", fontSize = 22.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(6.dp))
            Text(
                "The CMS is installed from the official GitHub repository. Fill in your server details, copy the command, and run it over SSH.",
                fontSize = 13.sp, color = Color.Gray,
            )

            Spacer(Modifier.height(16.dp))
            TextProjectRepoRow(onOpen = { uriHandler.openUri(ProjectInfo.REPO_WEB) })

            Spacer(Modifier.height(20.dp))
            Text("Method", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                InstallMethod.values().forEach { m ->
                    FilterChip(
                        selected = method == m,
                        onClick = { method = m; copied = false },
                        label = { Text(m.label) },
                    )
                }
            }

            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = host, onValueChange = { host = it; copied = false },
                label = { Text("Server IP or domain") },
                placeholder = { Text("e.g. 203.0.113.10") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = sshUser, onValueChange = { sshUser = it; copied = false },
                label = { Text("SSH user") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = installDir, onValueChange = { installDir = it; copied = false },
                label = { Text("Install directory") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = webPort, onValueChange = { p -> webPort = p.filter { it.isDigit() }.take(5); copied = false },
                label = { Text("Web port") },
                singleLine = true,
                isError = webPort.isNotEmpty() && !portValid,
                supportingText = { if (webPort.isNotEmpty() && !portValid) Text("Use a port from 1 to 65535.") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
            )

            Spacer(Modifier.height(8.dp))
            Text(
                when (method) {
                    InstallMethod.Docker -> "Runs PostgreSQL and the app together. DATABASE_URL is generated automatically; the stack publishes the web port and the built-in mail ports."
                    InstallMethod.BareMetal -> "Installs PostgreSQL 14+ when missing, creates the database, writes DATABASE_URL, builds, and installs a systemd service. Node 18+ is required."
                },
                fontSize = 12.sp, color = Color.Gray,
            )

            Spacer(Modifier.height(20.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Command", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                Spacer(Modifier.weight(1f))
                TextButton(
                    enabled = portValid,
                    onClick = {
                        clipboard.setText(AnnotatedString(command))
                        copied = true
                    },
                ) {
                    Icon(if (copied) Icons.Filled.Check else Icons.Filled.ContentCopy, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(6.dp))
                    Text(if (copied) "Copied" else "Copy")
                }
            }
            Spacer(Modifier.height(6.dp))
            Box(
                Modifier.fillMaxWidth()
                    .background(Color(0xFF111827), MaterialTheme.shapes.medium)
                    .padding(14.dp),
            ) {
                Text(
                    command,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 12.sp,
                    color = Color(0xFFE5E7EB),
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                )
            }

            Spacer(Modifier.height(20.dp))
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("After the command finishes", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    Spacer(Modifier.height(6.dp))
                    Step("1", "Open  http://<server>:${if (portValid) webPort else "3131"}  in a browser.")
                    Step("2", "Paste the SETUP_TOKEN printed by the installer to create the owner account.")
                    Step("3", "Studio → Mail: add your domain so the CMS can send email.")
                    Step("i", "SETUP_TOKEN works only until the first owner exists. MAIL_SESSION_SECRET is permanent; keep it private and unchanged.")
                    Step("i", "Setup token:  sudo grep SETUP_TOKEN ${installDir.ifBlank { "/opt/rayomand" }}/.env")
                }
            }

            Spacer(Modifier.height(20.dp))
            OutlinedButton(
                onClick = { uriHandler.openUri(ProjectInfo.REPO_WEB) },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Open the repository")
            }
        }
    }
}

@Composable
private fun TextProjectRepoRow(onOpen: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.medium,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Source, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(ProjectInfo.REPO_WEB.removePrefix("https://"), fontSize = 12.sp, modifier = Modifier.weight(1f))
            TextButton(onClick = onOpen) { Text("View") }
        }
    }
}

@Composable
private fun Step(badge: String, text: String) {
    Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
        Surface(color = MaterialTheme.colorScheme.primary, shape = MaterialTheme.shapes.small) {
            Text(
                badge, color = MaterialTheme.colorScheme.onPrimary, fontSize = 11.sp,
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp),
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(text, fontSize = 12.sp)
    }
}
