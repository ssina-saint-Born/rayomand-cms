package com.rayomand.mobile.shared

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.get
import io.ktor.client.request.parameter
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.json.Json

// Single client for every /api/mobile call. The base URL and token live in the
// caller; a platform-specific factory supplies the HTTP engine so this file
// stays in commonMain.

class ApiClient(
    private val baseUrl: String,
    private val http: HttpClient = defaultHttpClient(),
) {
    var token: String? = null
        private set

    fun setToken(value: String?) { token = value }

    private fun io.ktor.client.request.HttpRequestBuilder.auth() {
        token?.let { bearerAuth(it) }
    }

    private suspend inline fun <reified T> HttpResponse.decode(): T {
        if (status.value in 200..299) return body()
        val message = runCatching { body<ApiError>().error }.getOrElse { "HTTP ${status.value}" }
        throw ApiException(message, status.value)
    }

    private fun HttpResponse.ensureOk() {
        if (status.value !in 200..299) throw ApiException("HTTP ${status.value}", status.value)
    }

    suspend fun login(username: String, password: String, deviceId: String, platform: String, appVersion: String): AuthResponse {
        val res = http.post("$baseUrl/api/mobile/auth") {
            contentType(ContentType.Application.Json)
            setBody(mapOf(
                "username" to username,
                "password" to password,
                "device_id" to deviceId,
                "platform" to platform,
                "app_version" to appVersion,
            ))
        }
        return res.decode()
    }

    suspend fun bootstrap(): Bootstrap = http.get("$baseUrl/api/mobile/bootstrap") { auth() }.decode()

    suspend fun notifications(since: Int = 0, limit: Int = 50, deviceId: String? = null): NotificationFeed =
        http.get("$baseUrl/api/mobile/notifications") {
            auth()
            parameter("since", since)
            parameter("limit", limit)
            deviceId?.let { parameter("device_id", it) }
        }.decode()

    suspend fun markRead(ids: List<Int>): ReadResult =
        http.post("$baseUrl/api/mobile/notifications") {
            auth()
            contentType(ContentType.Application.Json)
            setBody(MarkReadRequest(ids = ids))
        }.decode()

    suspend fun content(status: String = "", page: Int = 1, perPage: Int = 20): ContentPage =
        http.get("$baseUrl/api/mobile/content") {
            auth()
            parameter("status", status)
            parameter("page", page)
            parameter("per_page", perPage)
        }.decode()

    suspend fun moderation(status: String = "pending"): CommentPage =
        http.get("$baseUrl/api/mobile/moderation") {
            auth()
            parameter("status", status)
        }.decode()

    suspend fun moderate(id: Int, action: String) {
        http.post("$baseUrl/api/mobile/moderation") {
            auth()
            contentType(ContentType.Application.Json)
            setBody(ModerateRequest(id = id, action = action))
        }.ensureOk()
    }

    suspend fun registerDevice(deviceId: String, platform: String, label: String, appVersion: String) {
        http.post("$baseUrl/api/mobile/devices") {
            auth()
            contentType(ContentType.Application.Json)
            setBody(mapOf(
                "device_id" to deviceId,
                "platform" to platform,
                "label" to label,
                "app_version" to appVersion,
            ))
        }.ensureOk()
    }
}

class ApiException(message: String, val status: Int) : Exception(message)

fun defaultJson(): Json = Json {
    ignoreUnknownKeys = true
    isLenient = true
    explicitNulls = false
}

// The engine is supplied per platform; this declaration is overridden by the
// actual expect/actual factory below.
expect fun platformHttpClient(json: Json): HttpClient

fun defaultHttpClient(): HttpClient = platformHttpClient(defaultJson())
