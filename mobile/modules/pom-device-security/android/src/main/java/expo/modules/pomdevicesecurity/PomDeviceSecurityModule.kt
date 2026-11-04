package expo.modules.pomdevicesecurity

import android.content.Context
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Attendance device security, in the Android Keystore:
 *  - an EC P-256 signing key per install (the private key never leaves the Keystore); the server keeps the public key and
 *    checks every punch's signature against it;
 *  - an AES-256-GCM key that encrypts selfies waiting offline in the app's private storage;
 *  - SHA-256 of a file, so the signature covers the exact photo bytes that are uploaded;
 *  - the Wi-Fi access point the phone is on (office Wi-Fi check — a fake GPS app cannot fake the network).
 */
class PomDeviceSecurityModule : Module() {
  private val keyStore: KeyStore by lazy { KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) } }

  override fun definition() = ModuleDefinition {
    Name("PomDeviceSecurity")

    /** Creates the signing key if this install has none; returns its public key either way. */
    AsyncFunction("ensureSigningKey") { alias: String ->
      val created = if (keyStore.containsAlias(alias)) {
        false
      } else {
        generateSigningKey(alias)
        true
      }
      publicKeyInfo(alias, created)
    }

    AsyncFunction("getPublicKey") { alias: String ->
      if (keyStore.containsAlias(alias)) publicKeyInfo(alias, false) else null
    }

    /** SHA256withECDSA over the UTF-8 bytes of `payload`, DER-encoded, base64. */
    AsyncFunction("sign") { alias: String, payload: String ->
      val key = keyStore.getKey(alias, null) as? PrivateKey ?: throw KeyMissingException(alias)
      val signer = Signature.getInstance("SHA256withECDSA")
      signer.initSign(key)
      signer.update(payload.toByteArray(Charsets.UTF_8))
      Base64.encodeToString(signer.sign(), Base64.NO_WRAP)
    }

    AsyncFunction("deleteKey") { alias: String ->
      if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
      Unit
    }

    AsyncFunction("sha256File") { uri: String ->
      val digest = MessageDigest.getInstance("SHA-256")
      fileOf(uri).inputStream().use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val n = input.read(buffer)
          if (n <= 0) break
          digest.update(buffer, 0, n)
        }
      }
      hex(digest.digest())
    }

    /** Writes `inUri` encrypted (12-byte IV + AES-GCM ciphertext) to `outUri`. */
    AsyncFunction("encryptFile") { inUri: String, outUri: String ->
      val cipher = Cipher.getInstance(AES_MODE)
      cipher.init(Cipher.ENCRYPT_MODE, evidenceKey())
      val sealed = cipher.doFinal(fileOf(inUri).readBytes())
      fileOf(outUri).outputStream().use { out ->
        out.write(cipher.iv)
        out.write(sealed)
      }
    }

    /**
     * The connected Wi-Fi access point: { bssid, ssid }, or null when not on Wi-Fi or Android hides it (no location
     * permission / location off reports the placeholder 02:00:00:00:00:00).
     */
    AsyncFunction("wifiInfo") {
      val context = appContext.reactContext?.applicationContext ?: return@AsyncFunction null
      val wifi = context.getSystemService(Context.WIFI_SERVICE) as? WifiManager ?: return@AsyncFunction null
      @Suppress("DEPRECATION")
      val info = wifi.connectionInfo ?: return@AsyncFunction null
      val bssid = info.bssid?.lowercase()
      if (bssid == null || bssid == "02:00:00:00:00:00") {
        null
      } else {
        mapOf("bssid" to bssid, "ssid" to info.ssid?.trim('"'))
      }
    }

    AsyncFunction("decryptFile") { inUri: String, outUri: String ->
      val bytes = fileOf(inUri).readBytes()
      if (bytes.size <= GCM_IV_BYTES) throw CorruptFileException()
      val cipher = Cipher.getInstance(AES_MODE)
      cipher.init(Cipher.DECRYPT_MODE, evidenceKey(), GCMParameterSpec(128, bytes, 0, GCM_IV_BYTES))
      fileOf(outUri).writeBytes(cipher.doFinal(bytes, GCM_IV_BYTES, bytes.size - GCM_IV_BYTES))
    }
  }

  private fun generateSigningKey(alias: String) {
    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEYSTORE)
    generator.initialize(
      KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
        .setDigests(KeyProperties.DIGEST_SHA256)
        .build(),
    )
    generator.generateKeyPair()
  }

  private fun publicKeyInfo(alias: String, created: Boolean): Map<String, Any?> {
    // The certificate's public key, as X.509 SubjectPublicKeyInfo (DER) — the format the server parses.
    val der = keyStore.getCertificate(alias).publicKey.encoded
    return mapOf(
      "publicKey" to Base64.encodeToString(der, Base64.NO_WRAP),
      "publicKeySha256" to hex(MessageDigest.getInstance("SHA-256").digest(der)),
      "created" to created,
      "hardwareBacked" to isHardwareBacked(alias),
    )
  }

  private fun isHardwareBacked(alias: String): Boolean? =
    try {
      val key = keyStore.getKey(alias, null) as PrivateKey
      val info = KeyFactory.getInstance(key.algorithm, ANDROID_KEYSTORE).getKeySpec(key, KeyInfo::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        info.securityLevel != KeyProperties.SECURITY_LEVEL_SOFTWARE
      } else {
        @Suppress("DEPRECATION")
        info.isInsideSecureHardware
      }
    } catch (e: Exception) {
      null
    }

  private fun evidenceKey(): SecretKey {
    (keyStore.getKey(EVIDENCE_ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(EVIDENCE_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return generator.generateKey()
  }

  private fun fileOf(uri: String): File = File(Uri.parse(uri).path ?: uri)

  private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

  companion object {
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val EVIDENCE_ALIAS = "pom_attendance_evidence"
    private const val AES_MODE = "AES/GCM/NoPadding"
    private const val GCM_IV_BYTES = 12
  }
}

private class KeyMissingException(alias: String) : CodedException("ERR_KEY_MISSING", "No attendance key '$alias' on this phone", null)

private class CorruptFileException : CodedException("ERR_CORRUPT_FILE", "The stored attendance photo is damaged", null)
