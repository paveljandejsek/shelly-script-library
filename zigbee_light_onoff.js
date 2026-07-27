// =====================================================================
// Configuration
// =====================================================================
var CFG = {
  debug: false,

  lights: [
    // Required: addr (decimal short address), ep (endpoint)
    { addr: 0xbd9e, ep: 1 },
    // { addr: 12345, ep: 11 },
  ],

  // Timeout for each SendCommand.
  pollTimeoutMs: 3000,
};

// Note: set the input to detached mode in the Shelly web UI (Settings -> Input -> Mode -> Detached)

// =====================================================================
// State
// =====================================================================
var busy = false;

// Guard against spurious input events that some firmware versions emit on boot
var ready = false;
Timer.set(1000, false, function () { ready = true; });

// =====================================================================
// Logging
// =====================================================================
function log(msg) { if (CFG.debug) print("[ZLC] " + msg); }

// =====================================================================
// Zigbee commands
// =====================================================================
function sendCommand(idx, cmd, next) {
  Shelly.call(
    "Zigbee.SendCommand",
    { dst_addr: CFG.lights[idx].addr, dst_ep: CFG.lights[idx].ep, cluster: 6, cmd: cmd, timeout_ms: CFG.pollTimeoutMs },
    function (res, err, msg) {
      if (err !== 0) {
        log("SendCommand: light=" + idx + " err=" + err + " msg=" + msg);
      } else {
        log("SendCommand: light=" + idx + " ok, state=" + (cmd === 1 ? "ON" : "OFF"));
      }
      if (next) next();
    }
  );
}

function sendAll(cmd, idx, done) {
  if (idx >= CFG.lights.length) { if (done) done(); return; }
  sendCommand(idx, cmd, function () { sendAll(cmd, idx + 1, done); });
}

// =====================================================================
// Input handler
// =====================================================================
Shelly.addStatusHandler(function (ev) {
  if (!ready || ev.component !== "input:0") return;
  if (typeof ev.delta.state === "undefined") return;
  if (busy) { log("button: ignored (busy)"); return; }

  busy = true;

  // 1 = On, 0 = Off, driven directly by the input's actual state
  var cmd = ev.delta.state ? 1 : 0;
  log("button: triggered, input state=" + ev.delta.state + " -> cmd=" + (cmd === 1 ? "ON" : "OFF"));

  sendAll(cmd, 0, function () { busy = false; });
});
