package com.rayomand.mobile.shared

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// Data types mirror the /api/mobile responses exactly. The web routes are the
// source of truth; keeping these small and additive avoids drift.

@Serializable
data class User(
    val id: Int,
    val username: String,
    @SerialName("display_name") val displayName: String = "",
    val role: String = "subscriber",
)

@Serializable
data class Site(val title: String = "", val url: String = "", val tagline: String = "")

@Serializable
data class Capabilities(
    val publish: Boolean = false,
    val moderate: Boolean = false,
    val admin: Boolean = false,
)

@Serializable
data class Bootstrap(
    val user: User,
    val site: Site = Site(),
    @SerialName("unread") val unread: Int = 0,
    val capabilities: Capabilities = Capabilities(),
)

@Serializable
data class AuthResponse(
    val token: String,
    @SerialName("token_id") val tokenId: Int = 0,
    @SerialName("expires_in_days") val expiresInDays: Int = 0,
    val user: User,
)

@Serializable
data class Notification(
    val id: Int,
    @SerialName("user_id") val userId: Int? = null,
    val kind: String = "",
    val level: String = "info",
    val title: String = "",
    val body: String = "",
    val url: String = "",
    @SerialName("read_at") val readAt: String? = null,
    @SerialName("created_at") val createdAt: String = "",
)

@Serializable
data class NotificationFeed(
    val notifications: List<Notification> = emptyList(),
    val unread: Int = 0,
)

@Serializable
data class ReadResult(val marked: Int = 0, val unread: Int = 0)

@Serializable
data class ContentItem(
    val id: Int,
    val type: String = "post",
    val title: String = "",
    val slug: String = "",
    val status: String = "",
    val excerpt: String = "",
    @SerialName("author_id") val authorId: Int = 0,
    @SerialName("updated_at") val updatedAt: String = "",
    @SerialName("published_at") val publishedAt: String = "",
)

@Serializable
data class ContentPage(
    val items: List<ContentItem> = emptyList(),
    val total: Int = 0,
)

@Serializable
data class Comment(
    val id: Int,
    @SerialName("post_id") val postId: Int = 0,
    @SerialName("post_title") val postTitle: String = "",
    @SerialName("author_name") val authorName: String = "",
    @SerialName("author_email") val authorEmail: String = "",
    val content: String = "",
    val status: String = "",
    @SerialName("created_at") val createdAt: String = "",
)

@Serializable
data class CommentPage(
    val items: List<Comment> = emptyList(),
    val total: Int = 0,
)

// The CMS wraps errors as { error, message_key, code }.
@Serializable
data class ApiError(val error: String = "Request failed", val code: Int = 0)

@Serializable
data class ModerateRequest(val id: Int, val action: String)

@Serializable
data class MarkReadRequest(val ids: List<Int>)
