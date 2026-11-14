// WonderMoves — MCU side (STM32 on UNO Q).
// Reads the Modulino sensors and streams raw samples to the Linux side over the Bridge.
// All game logic, calibration and detection live in python/main.py.

#include <Arduino_RouterBridge.h>
#include <Modulino.h>

ModulinoDistance distance;
ModulinoMovement movement;
ModulinoThermo thermo;

bool hasDistance = false, hasMovement = false, hasThermo = false;
unsigned long lastFast = 0, lastThermo = 0, lastStatus = 0;
unsigned long distanceSeen = 0, imuSeen = 0;   // samples since the last status report
int lastDistanceMm = -1;

void probeSensors() {
  // Retry any sensor that is missing, so a loose Qwiic plug can be fixed without a restart.
  if (!hasDistance) hasDistance = distance.begin();
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
    // available() is false when nothing is in range (e.g. the sensor faces the ceiling).
    if (hasDistance && distance.available()) {
      lastDistanceMm = (int)distance.get();
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
    distanceSeen = imuSeen = 0;
    if (!hasDistance || !hasMovement || !hasThermo) {
      Bridge.notify("i2c_scan", scanI2C());
    }
  }
}
