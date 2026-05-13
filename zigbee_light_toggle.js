// =====================================================================
// Configuration
// =====================================================================
var CFG = {
  debug: false,

  lights: [
    // Required: addr (decimal short address), ep (endpoint)
    { addr: 0xcac8, ep: 1 },
    // { addr: 12345, ep: 11 },
  ],

  // Timeout for ReadAttr (primary light poll) and each SendCommand.
  pollTimeoutMs: 3000,

  // Set to true for latching (bistable) switches - trigger on both press and release.
  // Set to false (default) for momentary buttons - trigger on press only.
  latchingSwitch: true,
};

// Note: set the input to detached mode in the Shelly web UI (Settings -> Input -> Mode -> Detached)

// =====================================================================
// State
// =====================================================================
// per-light: null = unknown (treated as off for toggle logic), true = on, false = off
var states = [];
for (var _i = 0; _i < CFG.lights.length; _i++) states.push(null);

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
        states[idx] = cmd === 1;
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
  if (!CFG.latchingSwitch && ev.delta.state !== true) return;
  if (CFG.latchingSwitch && typeof ev.delta.state === "undefined") return;
  if (busy) { log("button: ignored (busy)"); return; }

  busy = true;
  log("button: triggered");

  if (CFG.lights.length === 1) {
    Shelly.call(
      "Zigbee.SendCommand",
      { dst_addr: CFG.lights[0].addr, dst_ep: CFG.lights[0].ep, cluster: 6, cmd: 2, timeout_ms: CFG.pollTimeoutMs },
      function (res, err, msg) {
        if (err !== 0) {
          log("SendCommand: light=0 err=" + err + " msg=" + msg);
        } else {
          states[0] = !(states[0] === true);
          log("SendCommand: light=0 ok, assumed state=" + (states[0] ? "ON" : "OFF"));
        }
        busy = false;
      }
    );
  } else {
    Shelly.call(
      "Zigbee.ReadAttr",
      { dst_addr: CFG.lights[0].addr, dst_ep: CFG.lights[0].ep, cluster: 6, attr: 0, timeout_ms: CFG.pollTimeoutMs },
      function (res, err, msg) {
        var primaryOn;
        if (err !== 0 || !res || !res.success) {
          log("ReadAttr: light=0 failed (err=" + err + "), fallback state=" + states[0]);
          primaryOn = states[0] === true;
        } else {
          primaryOn = res.value === "01";
          states[0] = primaryOn;
          log("ReadAttr: light=0 ok, state=" + (primaryOn ? "ON" : "OFF"));
        }
        var cmd = primaryOn ? 0 : 1;
        sendAll(cmd, 0, function () { busy = false; });
      }
    );
  }
});
