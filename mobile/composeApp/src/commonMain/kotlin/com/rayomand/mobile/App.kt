@file:OptIn(ExperimentalMaterial3Api::class)

package com.rayomand.mobile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rayomand.mobile.shared.*

@Composable
fun RayomandApp2(vm: AppViewModel) {
    val state by vm.state.collectAsState()
    var showInstall by remember { mutableStateOf(false) }
    MaterialTheme(colorScheme = lightColorScheme(primary = Color(0xFF1F2937))) {
        when {
            showInstall -> InstallScreen(onBack = { showInstall = false })
            !state.signedIn -> SignInScreen(
                state,
                onSetUrl = vm::setBaseUrl,
                onSignIn = vm::signIn,
                onInstall = { showInstall = true },
            )
            else -> HomeScreen(state, onRefresh = vm::refresh, onMarkRead = vm::markRead, onModerate = vm::moderate, onSignOut = vm::signOut)
        }
    }
}

@Composable
private fun SignInScreen(
    state: UiState,
    onSetUrl: (String) -> Unit,
    onSignIn: (String, String, String) -> Unit,
    onInstall: () -> Unit,
) {
    var server by remember { mutableStateOf(state.baseUrl) }
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Rayomand", fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Text("Sign in to manage your site", fontSize = 14.sp, color = Color.Gray)
        Spacer(Modifier.height(24.dp))

        OutlinedTextField(server, { server = it; onSetUrl(it) }, label = { Text("Server address") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(username, { username = it }, label = { Text("Username") }, singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next))
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done))

        if (state.error != null) {
            Spacer(Modifier.height(12.dp))
            Text(state.error ?: "", color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
        }

        Spacer(Modifier.height(20.dp))
        Button(
            onClick = { onSignIn(username, password, ProjectInfo.APP_VERSION) },
            enabled = !state.loading && username.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (state.loading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
            else Text("Sign in")
        }

        Spacer(Modifier.height(12.dp))
        HorizontalDivider()
        Spacer(Modifier.height(12.dp))
        TextButton(onClick = onInstall, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.Dns, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Install the CMS on your server")
        }
    }
}

private enum class Tab(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Notifications("Alerts", Icons.Filled.Notifications),
    Content("Content", Icons.AutoMirrored.Filled.Article),
    Moderation("Review", Icons.AutoMirrored.Filled.Comment),
}

@Composable
private fun HomeScreen(state: UiState, onRefresh: () -> Unit, onMarkRead: (Int) -> Unit, onModerate: (Int, String) -> Unit, onSignOut: () -> Unit) {
    var tab by remember { mutableStateOf(Tab.Notifications) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Column { Text(state.site.title.ifBlank { "Rayomand" }, fontSize = 16.sp); Text(state.user?.displayName ?: state.user?.username ?: "", fontSize = 12.sp, color = Color.Gray) } },
                actions = {
                    BadgedBox(badge = { if (state.unread > 0) Badge { Text("${state.unread}") } }) {
                        IconButton(onClick = { tab = Tab.Notifications }) { Icon(Icons.Filled.Notifications, contentDescription = "Notifications") }
                    }
                    IconButton(onClick = onRefresh) { Icon(Icons.Filled.Refresh, contentDescription = "Refresh") }
                    IconButton(onClick = onSignOut) { Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Sign out") }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                Tab.values().forEach { t -> NavigationBarItem(
                    selected = tab == t,
                    onClick = { tab = t },
                    icon = { Icon(t.icon, contentDescription = t.label) },
                    label = { Text(t.label) },
                ) }
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (tab) {
                Tab.Notifications -> NotificationsTab(state, onMarkRead)
                Tab.Content -> ContentTab(state)
                Tab.Moderation -> ModerationTab(state, onModerate)
            }
            if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter))
        }
    }
}

@Composable
private fun NotificationsTab(state: UiState, onMarkRead: (Int) -> Unit) {
    if (state.notifications.isEmpty()) {
        EmptyState(Icons.Filled.Notifications, "No notifications", "New comments and order updates appear here.")
        return
    }
    LazyColumn(Modifier.fillMaxSize()) {
        items(state.notifications, key = { it.id }) { n ->
            ListItem(
                headlineContent = { Text(n.title, fontWeight = if (n.readAt == null) FontWeight.SemiBold else FontWeight.Normal) },
                supportingContent = { if (n.body.isNotBlank()) Text(n.body, maxLines = 2) },
                leadingContent = { Icon(levelIcon(n.level), contentDescription = null, tint = levelTint(n.level)) },
                trailingContent = { if (n.readAt == null) TextButton(onClick = { onMarkRead(n.id) }) { Text("Read") } },
                modifier = Modifier.clickable { if (n.readAt == null) onMarkRead(n.id) },
            )
            HorizontalDivider()
        }
    }
}

@Composable
private fun ContentTab(state: UiState) {
    if (state.content.isEmpty()) { EmptyState(Icons.AutoMirrored.Filled.Article, "No content yet", "Your drafts and published posts appear here."); return }
    LazyColumn(Modifier.fillMaxSize()) {
        items(state.content, key = { it.id }) { c ->
            ListItem(
                headlineContent = { Text(c.title.ifBlank { "(untitled)" }) },
                supportingContent = { Text("${c.type} · ${c.status} · ${c.updatedAt.take(10)}", fontSize = 12.sp) },
                leadingContent = { Icon(if (c.status == "publish") Icons.Filled.Public else Icons.Filled.EditNote, contentDescription = null) },
            )
            HorizontalDivider()
        }
    }
}

@Composable
private fun ModerationTab(state: UiState, onModerate: (Int, String) -> Unit) {
    if (!state.capabilities.moderate) { EmptyState(Icons.Filled.Lock, "Editors only", "Your role cannot moderate comments."); return }
    if (state.comments.isEmpty()) { EmptyState(Icons.Filled.CheckCircle, "All clear", "No comments waiting for review."); return }
    LazyColumn(Modifier.fillMaxSize()) {
        items(state.comments, key = { it.id }) { c ->
            Column(Modifier.fillMaxWidth().padding(16.dp)) {
                Text(c.authorName.ifBlank { "Visitor" }, fontWeight = FontWeight.SemiBold)
                Text(c.content, maxLines = 3, fontSize = 13.sp)
                Text(c.postTitle, fontSize = 11.sp, color = Color.Gray)
                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { onModerate(c.id, "approve") }) { Text("Approve") }
                    OutlinedButton(onClick = { onModerate(c.id, "spam") }) { Text("Spam") }
                    OutlinedButton(onClick = { onModerate(c.id, "trash") }) { Text("Trash") }
                }
            }
            HorizontalDivider()
        }
    }
}

@Composable
private fun EmptyState(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, body: String) {
    Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(48.dp), tint = Color.LightGray)
        Spacer(Modifier.height(12.dp))
        Text(title, fontWeight = FontWeight.SemiBold)
        Text(body, fontSize = 13.sp, color = Color.Gray)
    }
}

private fun levelIcon(level: String) = when (level) {
    "critical" -> Icons.Filled.Error
    "warning" -> Icons.Filled.Warning
    else -> Icons.Filled.Info
}

private fun levelTint(level: String) = when (level) {
    "critical" -> Color(0xFFB91C1C)
    "warning" -> Color(0xFFB45309)
    else -> Color(0xFF2563EB)
}
