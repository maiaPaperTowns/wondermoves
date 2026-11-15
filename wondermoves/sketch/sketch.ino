// WonderMoves — MCU side (STM32 on UNO Q).
// Reads the Modulino sensors and streams raw samples to the Linux side over the Bridge.
// All game logic, calibration and detection live in python/main.py.

#include <Arduino_RouterBridge.h>
#include <Modulino.h>
#include <vl53l4cd_class.h>
#include <vl53l4ed_class.h>

// Distance: we drive the VL53L4CD/ED chip directly instead of ModulinoDistance, because
// that class drops every reading with a range-status *warning* (1 = noisy, 2 = weak signal).
// A hand 15-30 cm away usually comes with such a warning, so the game only "saw" hands
// closer than ~12 cm. We keep status 0 at any distance, and warning statuses 1-2 only
// beyond 45 mm: with no strong target the chip reports a weak fake ~25-30 mm reading
// (light bouncing in its own cover window), which must not count as a hand.
VL53L4CD* tofCD = nullptr;
VL53L4ED* tofED = nullptr;
ModulinoMovement movement;
ModulinoThermo thermo;

bool hasDistance = false, hasMovement = false, hasThermo = false;
unsigned long lastFast = 0, lastThermo = 0, lastStatus = 0;
unsigned long distanceSeen = 0, imuSeen = 0;   // samples since the last status report
int lastDistanceMm = -1;

bool beginDistance() {
  Wire1.beginTransmission(0x29);
  if (Wire1.endTransmission() != 0) return false;
  tofCD = new VL53L4CD(&Wire1, -1);
  if (tofCD->InitSensor() == VL53L4CD_ERROR_NONE) {
    tofCD->VL53L4CD_SetRangeTiming(30, 0);   // 30 ms budget: better range than 20 ms
    tofCD->VL53L4CD_StartRanging();
    return true;
  }
  delete tofCD; tofCD = nullptr;
  tofED = new VL53L4ED(&Wire1, -1);
  if (tofED->InitSensor() == VL53L4ED_ERROR_NONE) {
    tofED->VL53L4ED_SetRangeTiming(30, 0);
    tofED->VL53L4ED_StartRanging();
    return true;
  }
  delete tofED; tofED = nullptr;
  return false;
}

const uint16_t WARN_MIN_MM = 45;
// Diagnostics: how many raw readings per status code since the last 1 Hz report,
// and the median-ish last raw distance, so we can see WHY readings are rejected.
unsigned long statusCount[8] = {0};
int lastRawMm = -1, lastRawStatus = -1;
int validReading(uint8_t status, uint16_t mm) {
  statusCount[status < 7 ? status : 7]++;
  lastRawMm = mm; lastRawStatus = status;
  if (mm == 0) return -1;
  if (status == 0) return mm;
  if (status <= 2 && mm >= WARN_MIN_MM) return mm;
  return -1;
}

// Returns distance in mm, or -1 when there is no new valid reading.
int readDistance() {
  uint8_t ready = 0;
  if (tofCD) {
    tofCD->VL53L4CD_CheckForDataReady(&ready);
    if (!ready) return -1;
    tofCD->VL53L4CD_ClearInterrupt();
    VL53L4CD_Result_t r;
    tofCD->VL53L4CD_GetResult(&r);
    return validReading(r.range_status, r.distance_mm);
  }
  if (tofED) {
    tofED->VL53L4ED_CheckForDataReady(&ready);
    if (!ready) return -1;
    tofED->VL53L4ED_ClearInterrupt();
    VL53L4ED_ResultsData_t r;
    tofED->VL53L4ED_GetResult(&r);
    return validReading(r.range_status, r.distance_mm);
  }
  return -1;
}

void probeSensors() {
  // Retry any sensor that is missing, so a loose Qwiic plug can be fixed without a restart.
  if (!hasDistance) hasDistance = beginDistance();
  if (!hasMovement) hasMovement = movement.begin();
  if (!hasThermo) hasThermo = thermo.begin();
}

// Lists every I2C address that answers on the Qwiic bus, e.g. "0x44 0x29 0x6A".
// Thermo = 0x44, Distance = 0x29, Movement = 0x6A/0x6B.
String scanI2C() {
  String found;
  for (uint8_t addr = 0x08; addr < 0x78; addr++) {
    Wire1.beginTransmission(addr);
    if (Wire1.endTransmission() == 0) {
      if (found.length()) found += " ";
      found += "0x" + String(addr, HEX);
    }
  }
  return found;
}

void setup() {
  Bridge.begin();
  Modulino.begin(Wire1);  // Qwiic connector is on Wire1 on the UNO Q
  probeSensors();
}

void loop() {
  unsigned long now = millis();

  // ~50 Hz: distance + IMU
  if (now - lastFast >= 20) {
    lastFast = now;
    // -1 when nothing is in range (e.g. the sensor faces the ceiling).
    int mm = hasDistance ? readDistance() : -1;
    if (mm > 0) {
      lastDistanceMm = mm;
      distanceSeen++;
      Bridge.notify("distance", lastDistanceMm);  // millimetres
    }
    if (hasMovement && movement.update()) {
      imuSeen++;
      Bridge.notify("imu",
                    movement.getX(), movement.getY(), movement.getZ(),            // accel (g)
                    movement.getRoll(), movement.getPitch(), movement.getYaw());  // gyro (dps)
    }
  }

  // 0.2 Hz: room temperature/humidity (comfort check only)
  if (hasThermo && now - lastThermo >= 5000) {
    lastThermo = now;
    Bridge.notify("thermo", thermo.getTemperature(), thermo.getHumidity());
  }

  // 1 Hz: which sensors are connected and whether they are producing data
  if (now - lastStatus >= 1000) {
    lastStatus = now;
    probeSensors();
    Bridge.notify("sensor_status", hasDistance, hasMovement, hasThermo,
                  (int)distanceSeen, (int)imuSeen, lastDistanceMm);
    // Numbers only over the Bridge (a String argument stopped all messages).
    Bridge.notify("distance_debug", (int)statusCount[0], (int)statusCount[1], (int)statusCount[2],
                  (int)(statusCount[3] + statusCount[4] + statusCount[5] + statusCount[6] + statusCount[7]),
                  lastRawMm, lastRawStatus);
    for (int i = 0; i < 8; i++) statusCount[i] = 0;
    distanceSeen = imuSeen = 0;
    if (!hasDistance || !hasMovement || !hasThermo) {
      Bridge.notify("i2c_scan", scanI2C());
    }
  }
}
