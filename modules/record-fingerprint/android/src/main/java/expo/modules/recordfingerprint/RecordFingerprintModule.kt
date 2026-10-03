package expo.modules.recordfingerprint

import android.app.PendingIntent
import android.app.Activity
import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Bundle
import android.util.Base64
import com.zkteco.android.biometric.FingerprintExceptionListener
import com.zkteco.android.biometric.core.device.ParameterHelper
import com.zkteco.android.biometric.core.device.TransportType
import com.zkteco.android.biometric.module.fingerprintreader.FingerprintCaptureListener
import com.zkteco.android.biometric.module.fingerprintreader.FingerprintSensor
import com.zkteco.android.biometric.module.fingerprintreader.FingprintFactory
import com.zkteco.android.biometric.module.fingerprintreader.ZKFingerService
import com.zkteco.android.biometric.module.fingerprintreader.exception.FingerprintException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout
import java.util.concurrent.atomic.AtomicBoolean

class RecordFingerprintModule : Module() {
  private val lock = Any()
  private data class Stored(val id: String, val customerId: String, val bytes: ByteArray)
  private val templates = mutableListOf<Stored>()
  private val hardwareLock = Any()
  private var candidate: ByteArray? = null
  private var candidateLength = 0
  private val captureGate = CaptureGate()
  private var lastCaptureError: Int? = null
  private var state = "connecting"
  private fun status(value: String) {
    if (state == value) return
    state = value
    android.util.Log.i("RecordFingerprint", "Reader state: $value")
    sendEvent("onDeviceStatus", mapOf("status" to value))
  }
  private val presses = arrayOfNulls<ByteArray>(3)
  private var sensor: FingerprintSensor? = null
  private var usb: UsbBridge? = null
  private var started = false
  private var sensorOpened = false
  private var rebooted = false
  private var mode = Mode.Idle
  private var press = 0
  private var pid = 0
  private var openCont: CancellableContinuation<Unit>? = null
  private var enrollCont: CancellableContinuation<String>? = null
  private var identifyCont: CancellableContinuation<Map<String, Any>?>? = null

  private enum class Mode { Idle, Enroll, Identify }

  override fun definition() = ModuleDefinition {
    Name("RecordFingerprint")
    Events("onCaptureProgress", "onDeviceStatus", "onDuplicate")
    OnDestroy { closeDevice() }
    OnActivityEntersBackground {
      // Android's own USB permission dialog pauses (but does not stop) our
      // activity. UsbBridge watches onStop to distinguish leaving the app.
      if (state != "permission") closeDevice()
    }
    Constants("apiVersion" to 2)
    AsyncFunction("openDevice") Coroutine { -> openDevice() }
    AsyncFunction("closeDevice") { closeDevice() }
    AsyncFunction("getUsbStatus") { usbStatus() }
    AsyncFunction("loadTemplates") { items: List<Map<String, Any?>> ->
      loadTemplates(items)
    }
    AsyncFunction("enroll") Coroutine { -> enroll() }
    AsyncFunction("identify") Coroutine { -> identify() }
  }

  private fun context(): Context =
    appContext.currentActivity
      ?: appContext.reactContext
      ?: throw IllegalStateException("readerFailed")

  private suspend fun openDevice() {
    android.util.Log.i("RecordFingerprint", "Open requested; started=$started")
    if (started) return
    status("connecting")
    try {
      withTimeout(60_000) {
        suspendCancellableCoroutine<Unit> { cont ->
          synchronized(lock) {
            if (openCont != null) { cont.resumeWithException(IllegalStateException("fingerprintBusy")); return@suspendCancellableCoroutine }
            openCont = cont
          }
          cont.invokeOnCancellation { synchronized(lock) { openCont = null } }
          val found = findReader()
          if (found == 0) {
            val status = usbStatus()
            finishOpen(when {
              status["hostSupported"] != true -> "readerNoHost"
              (status["devices"] as List<*>).isNotEmpty() -> "readerUnsupported"
              else -> "readerNotFound"
            })
            return@suspendCancellableCoroutine
          }
          pid = found
          val bridge = usb ?: UsbBridge(context()) { code -> onPermission(code) }.also {
            it.register()
            usb = it
          }
          bridge.request(VID, pid)
        }
      }
    } catch (_: TimeoutCancellationException) {
      throw IllegalStateException("readerPermissionTimeout")
    }
  }

  private fun onPermission(code: Int) {
    val waiting = synchronized(lock) { openCont?.isActive == true }
    if (!waiting) return
    when (code) {
      0 -> openSensor()
      -2 -> finishOpen("readerDenied")
      else -> finishOpen("readerNotFound")
    }
  }

  private fun openSensor() = synchronized(hardwareLock) {
    if (synchronized(lock) { openCont?.isActive != true }) return@synchronized
    try {
      releaseSensor()
      lastCaptureError = null
      val params = hashMapOf<String, Any>(
        ParameterHelper.PARAM_KEY_VID to VID,
        ParameterHelper.PARAM_KEY_PID to pid,
      )
      val next = FingprintFactory.createFingerprintSensor(
        context().applicationContext,
        TransportType.USB,
        params,
      )
      sensor = next
      next.setCaptureMode(0)
      next.open(0)
      sensorOpened = true
      next.setFingerprintCaptureListener(0, captureListener)
      next.SetFingerprintExceptionListener(exceptionListener)
      next.startCapture(0)
      started = true
      rebooted = false
      mode = Mode.Idle
      press = 0
      status("ready")
      finishOpen(null)
    } catch (error: Exception) {
      android.util.Log.w("RecordFingerprint", "Open failed: ${error.javaClass.simpleName}; internal=${(error as? FingerprintException)?.internalErrorCode}")
      releaseSensor()
      finishOpen("readerFailed")
    }
  }

  private fun finishOpen(error: String?) {
    val cont = synchronized(lock) { openCont.also { openCont = null } } ?: return
    if (!cont.isActive) return
    if (error == null) cont.resume(Unit) else cont.resumeWithException(Exception(error))
  }

  private fun releaseSensor() {
    if (started) {
      try {
        sensor?.stopCapture(0)
      } catch (_: FingerprintException) {
      }
    }
    // open() can succeed even when startCapture() fails. Close its USB handle too.
    if (sensorOpened) {
      try {
        sensor?.close(0)
      } catch (_: FingerprintException) {
      }
    }
    sensor?.let {
      try {
        FingprintFactory.destroy(it)
      } catch (_: Exception) {
      }
    }
    sensor = null
    started = false
    sensorOpened = false
    mode = Mode.Idle
    press = 0
  }

  private fun closeDevice() = synchronized(hardwareLock) {
    android.util.Log.i("RecordFingerprint", "Close requested")
    synchronized(lock) {
      failPending("readerClosed")
      clearCapture()
      templates.forEach { it.bytes.fill(0) }
      templates.clear()
    }
    releaseSensor()
    usb?.unregister()
    usb = null
  }

  private fun clearCapture() {
    candidate?.fill(0)
    candidate = null
    candidateLength = 0
    presses.forEach { it?.fill(0) }
    presses.fill(null)
    captureGate.reset()
    press = 0
  }

  private fun loadTemplates(items: List<Map<String, Any?>>) = synchronized(lock) {
    if (!started) throw IllegalStateException("readerNotFound")
    if (mode != Mode.Idle) throw IllegalStateException("fingerprintBusy")
    templates.forEach { it.bytes.fill(0) }
    templates.clear()
    for (item in items) {
      val id = item["id"] as? String ?: throw IllegalArgumentException("fingerprintInvalid")
      val customerId = item["customerId"] as? String ?: id
      val encoded = item["template"] as? String ?: throw IllegalArgumentException("fingerprintInvalid")
      val bytes = try { Base64.decode(encoded, Base64.NO_WRAP) } catch (_: IllegalArgumentException) { throw IllegalArgumentException("fingerprintInvalid") }
      if (bytes.isEmpty() || bytes.size > 2048) throw IllegalArgumentException("fingerprintInvalid")
      templates.add(Stored(id, customerId, bytes))
    }
  }

  private suspend fun enroll(): String {
    if (!started) throw IllegalStateException("readerNotFound")
    return awaitCapture(Mode.Enroll) { enrollCont = it }
  }

  private suspend fun identify(): Map<String, Any>? {
    if (!started) throw IllegalStateException("readerNotFound")
    return awaitCapture(Mode.Identify) { identifyCont = it }
  }

  private suspend fun <T> awaitCapture(next: Mode, slot: (CancellableContinuation<T>?) -> Unit): T {
    try {
      return withTimeout(90_000) {
        suspendCancellableCoroutine<T> { cont ->
          synchronized(lock) {
            if (mode != Mode.Idle) {
              cont.resumeWithException(IllegalStateException("fingerprintFailed"))
              return@synchronized
            }
            clearCapture()
            mode = next
            status("ready")
            slot(cont)
          }
          cont.invokeOnCancellation {
            synchronized(lock) {
              if (mode == next) mode = Mode.Idle
              slot(null)
              clearCapture()
            }
          }
        }
      }
    } catch (_: kotlinx.coroutines.TimeoutCancellationException) {
      synchronized(lock) {
        mode = Mode.Idle
        slot(null)
      }
      throw IllegalStateException("fingerprintTimeout")
    }
  }

  private val captureListener = object : FingerprintCaptureListener {
    override fun captureOK(fpImage: ByteArray?) {
      synchronized(lock) {
        captureGate.image()
        if (mode != Mode.Idle && !captureGate.waiting()) status("reading")
      }
      // Images remain within the SDK callback and are never persisted or exposed to JS.
    }

    override fun captureError(e: FingerprintException?) {
      val code = e?.internalErrorCode
      if (lastCaptureError != code) {
        lastCaptureError = code
        android.util.Log.i("RecordFingerprint", "Capture status code: $code")
      }
      synchronized(lock) {
        if (mode == Mode.Idle) return
        if (captureGate.idle(code ?: Int.MIN_VALUE, android.os.SystemClock.elapsedRealtime())) {
          status(if (candidate != null) "verify" else "ready")
        } else if (!captureGate.waiting() && code != 0) {
          status("reposition")
        }
      }
    }

    override fun extractOK(fpTemplate: ByteArray?) {
      if (fpTemplate == null || fpTemplate.isEmpty()) return
      synchronized(lock) {
        if (!captureGate.extract()) return
        when (mode) {
          Mode.Enroll -> onEnrollPress(fpTemplate)
          Mode.Identify -> onIdentifyPress(fpTemplate)
          Mode.Idle -> Unit
        }
      }
    }

    override fun extractError(code: Int) {
      synchronized(lock) {
        captureGate.extractionFailed()
        if (mode != Mode.Idle && !captureGate.waiting()) status("reposition")
      }
    }
  }

  private val exceptionListener = FingerprintExceptionListener {
    synchronized(lock) {
      status("removed")
      failPending("readerClosed")
      clearCapture()
    }
  }

  private fun matches(template: ByteArray): List<Pair<Stored, Int>> = templates.mapNotNull {
    val score = ZKFingerService.verify(it.bytes, template)
    if (score >= MATCH_THRESHOLD) Pair(it, score) else null
  }

  private fun onEnrollPress(template: ByteArray) {
    val hits = matches(template)
    if (hits.isNotEmpty()) {
      val ids = hits.map { it.first.customerId }.distinct()
      sendEvent("onDuplicate", mapOf("customerId" to if (ids.size == 1) ids.first() else ""))
      failEnroll(if (ids.size == 1) "fingerprintExists" else "fingerprintAmbiguous")
      return
    }
    val merged = candidate
    if (merged != null) {
      if (ZKFingerService.verify(merged, template) < MATCH_THRESHOLD) {
        captureGate.requireLift()
        status("verificationMismatch")
        return
      }
      val encoded = Base64.encodeToString(merged, 0, candidateLength, Base64.NO_WRAP)
      mode = Mode.Idle
      clearCapture()
      status("success")
      resumeEnroll(Result.success(encoded))
      return
    }
    if (press > 0 && ZKFingerService.verify(presses[press - 1], template) < MATCH_THRESHOLD) {
      captureGate.requireLift()
      status("mismatch")
      return
    }
    if (press >= 3) return
    presses[press] = template.copyOf(2048)
    press += 1
    captureGate.requireLift()
    status("lift")
    sendEvent("onCaptureProgress", mapOf("step" to press))
    if (press < 3) return
    val output = ByteArray(2048)
    val length = ZKFingerService.merge(presses[0], presses[1], presses[2], output)
    if (length <= 0 || length > output.size) { output.fill(0); failEnroll("fingerprintFailed"); return }
    candidate = output
    candidateLength = length
  }

  private fun onIdentifyPress(template: ByteArray) {
    val hits = matches(template)
    mode = Mode.Idle
    if (hits.map { it.first.customerId }.distinct().size > 1) {
      resumeIdentify(Result.failure(IllegalStateException("fingerprintAmbiguous")))
      return
    }
    val hit = hits.maxByOrNull { it.second }
    if (hit == null) { resumeIdentify(Result.success(null)); return }
    status("success")
    resumeIdentify(Result.success(mapOf("customerId" to hit.first.customerId, "fingerprintId" to hit.first.id, "score" to hit.second)))
  }

  private fun failEnroll(error: String) {
    mode = Mode.Idle
    press = 0
    resumeEnroll(Result.failure(IllegalStateException(error)))
  }

  private fun resumeEnroll(result: Result<String>) {
    val cont = synchronized(lock) { enrollCont.also { enrollCont = null } } ?: return
    if (cont.isActive) cont.resumeWith(result)
  }

  private fun resumeIdentify(result: Result<Map<String, Any>?>) {
    val cont = synchronized(lock) { identifyCont.also { identifyCont = null } } ?: return
    if (cont.isActive) cont.resumeWith(result)
  }

  private fun failPending(error: String) {
    finishOpen(error)
    failEnroll(error)
    resumeIdentify(Result.failure(IllegalStateException(error)))
  }

  private fun findReader(): Int {
    val manager = context().getSystemService(Context.USB_SERVICE) as UsbManager
    for (device in manager.deviceList.values) {
      if (supported(device)) return device.productId
    }
    return 0
  }

  private fun supported(device: UsbDevice): Boolean =
    device.vendorId == VID && device.productId in SUPPORTED_PIDS

  // Connection metadata only: never expose serial numbers, images or templates.
  private fun usbStatus(): Map<String, Any> {
    val ctx = context()
    val manager = ctx.getSystemService(Context.USB_SERVICE) as UsbManager
    return mapOf(
      "hostSupported" to ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_USB_HOST),
      "devices" to manager.deviceList.values.map { device ->
        mapOf(
          "vendorId" to device.vendorId,
          "productId" to device.productId,
          "supported" to supported(device),
          "permissionGranted" to manager.hasPermission(device),
        )
      },
    )
  }

  private inner class UsbBridge(
    private val context: Context,
    private val onResult: (Int) -> Unit,
  ) {
    private val registered = AtomicBoolean(false)
    private val application = context.applicationContext as Application
    private val lifecycle = object : Application.ActivityLifecycleCallbacks {
      override fun onActivityStopped(activity: Activity) {
        if (activity === context) {
          status("removed")
          closeDevice()
        }
      }
      override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) = Unit
      override fun onActivityStarted(activity: Activity) = Unit
      override fun onActivityResumed(activity: Activity) = Unit
      override fun onActivityPaused(activity: Activity) = Unit
      override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) = Unit
      override fun onActivityDestroyed(activity: Activity) = Unit
    }
    private val receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        if (intent == null) return
        val device = usbDevice(intent) ?: return
        if (device.vendorId != VID || device.productId != pid) return
        when (intent.action) {
          ACTION -> {
            val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
            onResult(if (granted) 0 else -2)
          }
          UsbManager.ACTION_USB_DEVICE_DETACHED -> {
            sendEvent("onDeviceStatus", mapOf("status" to "removed"))
            closeDevice()
          }
        }
      }
    }

    fun register() {
      if (!registered.compareAndSet(false, true)) return
      application.registerActivityLifecycleCallbacks(lifecycle)
      val filter = IntentFilter().apply {
        addAction(ACTION)
        addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
        addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
      }
      if (Build.VERSION.SDK_INT >= 33) {
        context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        context.registerReceiver(receiver, filter)
      }
    }

    fun unregister() {
      if (!registered.compareAndSet(true, false)) return
      application.unregisterActivityLifecycleCallbacks(lifecycle)
      try {
        context.unregisterReceiver(receiver)
      } catch (_: IllegalArgumentException) {
      }
    }

    fun request(vendor: Int, product: Int) {
      val manager = context.getSystemService(Context.USB_SERVICE) as UsbManager
      val device = manager.deviceList.values.firstOrNull {
        it.vendorId == vendor && it.productId == product
      }
      if (device == null) {
        onResult(-1)
        return
      }
      if (manager.hasPermission(device)) {
        onResult(0)
        return
      }
      val flags = when {
        Build.VERSION.SDK_INT >= 31 -> PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        else -> PendingIntent.FLAG_UPDATE_CURRENT
      }
      val intent = Intent(ACTION).setPackage(context.packageName)
      val pending = PendingIntent.getBroadcast(context, 0, intent, flags)
      status("permission")
      manager.requestPermission(device, pending)
    }
  }

  private fun usbDevice(intent: Intent): UsbDevice? =
    if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
    }

  companion object {
    private const val MATCH_THRESHOLD = 70
    private const val VID = 0x1b55
    // Both readers are supported by the bundled ZKFingerAndroidSDK 2.1.24 demo.
    private val SUPPORTED_PIDS = setOf(0x0120, 0x0124)
    private const val ACTION = "com.radefy.mobilerecords.USB_PERMISSION"
  }
}
