package com.rayomand.mobile.shared

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// Screen state and actions, kept platform-agnostic so both Android and iOS
// reuse it. The Compose UI observes `state`; the owner supplies a scope.

data class UiState(
    val loading: Boolean = false,
    val signedIn: Boolean = false,
    val user: User? = null,
    val site: Site = Site(),
    val capabilities: Capabilities = Capabilities(),
    val notifications: List<Notification> = emptyList(),
    val unread: Int = 0,
    val content: List<ContentItem> = emptyList(),
    val comments: List<Comment> = emptyList(),
    val error: String? = null,
    val baseUrl: String = "",
)

class AppViewModel(
    private val store: SessionStore,
    private val scope: CoroutineScope,
    private val platform: String,
) {
    private val _state = MutableStateFlow(UiState(baseUrl = store.baseUrl))
    val state: StateFlow<UiState> = _state.asStateFlow()

    private val api = ApiClient(store.baseUrl)

    init {
        api.setToken(store.token)
        if (store.token != null) refresh()
    }

    fun setBaseUrl(url: String) {
        store.baseUrl = url
        _state.value = _state.value.copy(baseUrl = store.baseUrl)
    }

    fun signIn(username: String, password: String, appVersion: String) {
        scope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                // Rebuild the client if the base URL changed since launch.
                val client = ApiClient(store.baseUrl)
                val auth = client.login(username, password, store.deviceId, platform, appVersion)
                store.token = auth.token
                client.setToken(auth.token)
                _state.value = _state.value.copy(signedIn = true, loading = false, user = auth.user)
                refresh()
            }
            catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message ?: "Sign-in failed")
            }
        }
    }

    fun refresh() {
        scope.launch {
            _state.value = _state.value.copy(loading = true, error = null)
            try {
                val client = ApiClient(store.baseUrl).also { it.setToken(store.token) }
                val boot = client.bootstrap()
                val feed = client.notifications(deviceId = store.deviceId)
                val content = runCatching { client.content() }.getOrNull()
                val comments = runCatching { client.moderation() }.getOrNull()
                _state.value = _state.value.copy(
                    loading = false,
                    signedIn = true,
                    user = boot.user,
                    site = boot.site,
                    capabilities = boot.capabilities,
                    unread = feed.unread,
                    notifications = feed.notifications,
                    content = content?.items ?: emptyList(),
                    comments = comments?.items ?: emptyList(),
                )
            }
            catch (e: ApiException) {
                if (e.status == 401) signOut()
                else _state.value = _state.value.copy(loading = false, error = e.message)
            }
            catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message ?: "Could not reach the server")
            }
        }
    }

    fun markRead(id: Int) {
        scope.launch {
            try {
                val client = ApiClient(store.baseUrl).also { it.setToken(store.token) }
                val result = client.markRead(listOf(id))
                _state.value = _state.value.copy(
                    unread = result.unread,
                    notifications = _state.value.notifications.map { if (it.id == id) it.copy(readAt = "now") else it },
                )
            }
            catch (_: Exception) { /* the next refresh will reconcile */ }
        }
    }

    fun moderate(id: Int, action: String) {
        scope.launch {
            try {
                val client = ApiClient(store.baseUrl).also { it.setToken(store.token) }
                client.moderate(id, action)
                _state.value = _state.value.copy(comments = _state.value.comments.filterNot { it.id == id })
            }
            catch (e: Exception) {
                _state.value = _state.value.copy(error = e.message)
            }
        }
    }

    fun signOut() {
        store.clear()
        _state.value = UiState(baseUrl = store.baseUrl)
    }
}
